// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeTransfer, ReentrancyGuard} from "./lib/SafeTransfer.sol";

interface IV2Factory {
    function getPair(address, address) external view returns (address);
}

interface IPairReserves {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

/// YES/NO markets in USDG, settled as a pool of stakes (no market maker to drain on thin markets).
///
/// Two kinds:
///  - Survival: "will this V2 pool still hold at least `minReserve` of its base token?" Settled from the
///    chain alone. During the watch window anyone may `poke`, and the contract keeps the LOWEST reserve it
///    has seen; pulling liquidity at any poke is enough for NO, and parking it for a moment cannot buy YES.
///  - Price: "will this V2 pool's token trade at or above `strike` (in its base) at expiry?" Also settled
///    from the chain alone, by the pool's own time-weighted average price (Uniswap V2 cumulative prices)
///    over a window that ends at expiry: anyone records the start of the window, anyone settles after
///    expiry. Nobody proposes an outcome and nobody rules on it. A missed start or a late settlement refunds.
///
/// Stakes placed earlier weigh more (up to +50% at creation, +0% at close): information is paid, last-second
/// sniping is not. Winners get their stake back plus the losers' pool, split by weight, minus a 1% fee to
/// the Gap Fund. If either side is empty, or nobody won, or settlement stalls, everyone is refunded.
contract CorbelPredict is ReentrancyGuard {
    using SafeTransfer for address;

    enum Kind {
        Survival,
        Price
    }
    enum State {
        Open,
        Proposed, // not used since v2 (no resolver); kept so the market layout matches v1
        Settled,
        Void
    }

    struct Market {
        Kind kind;
        State state;
        bool outcome;
        uint64 createdAt;
        uint64 closeAt;
        uint64 expiry;
        uint64 proposedAt;
        address pair;
        address base;
        uint256 minReserve;
        uint256 lowest;
        uint32 pokes;
        uint64 lastPoke;
        bytes32 question;
        uint256 strike;
        address challenger; // not used since v2; kept so the market layout matches v1
        uint256 yesPot;
        uint256 noPot;
        uint256 yesWeight;
        uint256 noWeight;
    }

    uint256 public constant FEE_BPS = 100; // 1% of the losing side, to the Gap Fund
    uint256 public constant EARLY_BONUS_BPS = 5_000; // +50% weight at creation, falling to 0 at close
    uint64 public constant MIN_WINDOW = 30 minutes; // price: shortest TWAP window
    uint64 public constant MAX_WINDOW = 1 days;
    uint64 public constant STALL = 14 days; // past expiry with no settlement: refunds open
    uint32 public constant MIN_POKES = 3; // survival: fewer public checks than this and the market refunds

    address public immutable usdg;
    address public immutable factory;
    address public immutable fund;

    Market[] internal _markets;
    mapping(uint256 => mapping(address => uint256[2])) public stake; // [no, yes]
    mapping(uint256 => mapping(address => uint256[2])) public weight; // [no, yes]
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// Price markets: the TWAP window length, and the pool's cumulative price and time where it started.
    struct Twap {
        uint64 window;
        uint64 startedAt;
        uint256 cumStart;
    }

    mapping(uint256 => Twap) public twap;

    event Created(uint256 indexed id, Kind kind, address pair, bytes32 question, uint64 closeAt, uint64 expiry);
    event Bet(uint256 indexed id, address indexed who, bool yes, uint256 amount, uint256 weight);
    event Poked(uint256 indexed id, uint256 reserve, uint256 lowest);
    event TwapStarted(uint256 indexed id, uint256 cumulative, uint64 at);
    event Settled(uint256 indexed id, bool outcome, uint256 fee);
    event Voided(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed who, uint256 amount);

    constructor(address usdg_, address factory_, address fund_) {
        require(usdg_ != address(0) && factory_ != address(0) && fund_ != address(0), "zero");
        usdg = usdg_;
        factory = factory_;
        fund = fund_;
    }

    function markets(uint256 id) external view returns (Market memory) {
        return _markets[id];
    }

    function count() external view returns (uint256) {
        return _markets.length;
    }

    // ------------------------------------------------------------------ create

    function _checkPair(address pair, address base) internal view {
        address t0 = IPairReserves(pair).token0();
        address t1 = IPairReserves(pair).token1();
        require(base == t0 || base == t1, "base");
        require(IV2Factory(factory).getPair(t0, t1) == pair, "not a factory pair");
    }

    /// Anyone may open a survival market on a V2 pair against `base` (WETH or USDG).
    function createSurvival(address pair, address base, uint256 minReserve, uint64 closeAt, uint64 expiry) external returns (uint256 id) {
        require(closeAt > block.timestamp && expiry > closeAt, "times");
        _checkPair(pair, base);
        require(minReserve > 0, "min");
        id = _markets.length;
        Market storage m = _markets.push();
        m.kind = Kind.Survival;
        m.createdAt = uint64(block.timestamp);
        m.closeAt = closeAt;
        m.expiry = expiry;
        m.pair = pair;
        m.base = base;
        m.minReserve = minReserve;
        m.lowest = type(uint256).max;
        emit Created(id, Kind.Survival, pair, bytes32(0), closeAt, expiry);
    }

    /// Anyone may open a price market on a V2 pair: YES if the pair's other token trades at or above `strike` (base
    /// per token, raw units, UQ112x112 like the pair's own cumulative prices) on average over the `window` before
    /// `expiry`. `question` is the human wording, kept for display.
    function createPrice(address pair, address base, uint256 strike, uint64 window, bytes32 question, uint64 closeAt, uint64 expiry)
        external
        returns (uint256 id)
    {
        require(window >= MIN_WINDOW && window <= MAX_WINDOW, "window");
        require(closeAt > block.timestamp && expiry >= closeAt + window, "times"); // bets close before the window opens
        _checkPair(pair, base);
        require(strike > 0, "strike");
        id = _markets.length;
        Market storage m = _markets.push();
        m.kind = Kind.Price;
        m.createdAt = uint64(block.timestamp);
        m.closeAt = closeAt;
        m.expiry = expiry;
        m.pair = pair;
        m.base = base;
        m.question = question;
        m.strike = strike;
        twap[id].window = window;
        emit Created(id, Kind.Price, pair, question, closeAt, expiry);
    }

    // ------------------------------------------------------------------ bet

    function bet(uint256 id, bool yes, uint256 amount) external nonReentrant {
        Market storage m = _markets[id];
        require(m.state == State.Open && block.timestamp < m.closeAt, "closed");
        require(amount > 0, "amount");
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        uint256 left = m.closeAt - block.timestamp;
        uint256 span = m.closeAt - m.createdAt;
        uint256 w = amount + (amount * EARLY_BONUS_BPS * left) / (span * 10_000);
        uint256 side = yes ? 1 : 0;
        stake[id][msg.sender][side] += amount;
        weight[id][msg.sender][side] += w;
        if (yes) {
            m.yesPot += amount;
            m.yesWeight += w;
        } else {
            m.noPot += amount;
            m.noWeight += w;
        }
        emit Bet(id, msg.sender, yes, amount, w);
    }

    // ------------------------------------------------------------------ survival

    function _reserve(Market storage m) internal view returns (uint256) {
        (uint112 r0, uint112 r1, uint32 last) = IPairReserves(m.pair).getReserves();
        require(last != uint32(block.timestamp), "reserves moved this block");
        return IPairReserves(m.pair).token0() == m.base ? r0 : r1;
    }

    /// During the watch window (close → expiry) anyone records the pool's reserve; the lowest one counts.
    function poke(uint256 id) public {
        Market storage m = _markets[id];
        require(m.kind == Kind.Survival && m.state == State.Open, "kind");
        require(block.timestamp >= m.closeAt && block.timestamp <= m.expiry, "window");
        uint256 r = _reserve(m);
        if (r < m.lowest) m.lowest = r;
        if (m.lastPoke + 1 hours <= block.timestamp) {
            m.pokes++;
            m.lastPoke = uint64(block.timestamp);
        }
        emit Poked(id, r, m.lowest);
    }

    function settleSurvival(uint256 id) external {
        Market storage m = _markets[id];
        require(m.kind == Kind.Survival && m.state == State.Open, "kind");
        require(block.timestamp > m.expiry, "early");
        uint256 r = _reserve(m);
        if (r < m.lowest) m.lowest = r;
        if (m.pokes < MIN_POKES) {
            m.state = State.Void;
            emit Voided(id);
            return;
        }
        _settle(id, m.lowest >= m.minReserve);
    }

    // ------------------------------------------------------------------ price

    /// The pool's cumulative price of its non-base token, in base, brought up to this second (Uniswap V2
    /// oracle maths: the sums wrap by design, so differences are taken unchecked).
    function _cumulative(Market storage m) internal view returns (uint256 c) {
        IPairReserves p = IPairReserves(m.pair);
        bool baseIs1 = p.token1() == m.base;
        c = baseIs1 ? p.price0CumulativeLast() : p.price1CumulativeLast();
        (uint112 r0, uint112 r1, uint32 last) = p.getReserves();
        uint32 nowTs = uint32(block.timestamp);
        unchecked {
            if (last != nowTs && r0 > 0 && r1 > 0) {
                uint256 px = baseIs1 ? (uint256(r1) << 112) / r0 : (uint256(r0) << 112) / r1;
                c += px * (nowTs - last);
            }
        }
    }

    /// Anyone records the start of the TWAP window, between `expiry - window` and `expiry - window / 2`.
    function startTwap(uint256 id) external {
        Market storage m = _markets[id];
        Twap storage t = twap[id];
        require(m.kind == Kind.Price && m.state == State.Open && t.startedAt == 0, "state");
        require(block.timestamp >= m.expiry - t.window && block.timestamp <= m.expiry - t.window / 2, "window");
        t.cumStart = _cumulative(m);
        t.startedAt = uint64(block.timestamp);
        emit TwapStarted(id, t.cumStart, t.startedAt);
    }

    /// After expiry anyone settles from the TWAP. No start recorded, or past `expiry + window / 2`: refunds.
    function settlePrice(uint256 id) external {
        Market storage m = _markets[id];
        Twap storage t = twap[id];
        require(m.kind == Kind.Price && m.state == State.Open, "kind");
        require(block.timestamp >= m.expiry, "early");
        if (t.startedAt == 0 || block.timestamp > m.expiry + t.window / 2) {
            m.state = State.Void;
            emit Voided(id);
            return;
        }
        uint256 avg;
        unchecked {
            avg = (_cumulative(m) - t.cumStart) / (block.timestamp - t.startedAt);
        }
        _settle(id, avg >= m.strike);
    }

    // ------------------------------------------------------------------ settle, claim, refund

    function _settle(uint256 id, bool outcome) internal {
        Market storage m = _markets[id];
        uint256 winW = outcome ? m.yesWeight : m.noWeight;
        uint256 losPot = outcome ? m.noPot : m.yesPot;
        if (winW == 0 || losPot == 0) {
            m.state = State.Void;
            emit Voided(id);
            return;
        }
        m.state = State.Settled;
        m.outcome = outcome;
        uint256 fee = (losPot * FEE_BPS) / 10_000;
        if (fee > 0) usdg.safeTransfer(fund, fee);
        emit Settled(id, outcome, fee);
    }

    /// After expiry + STALL with no settlement, anyone turns the market into refunds.
    function voidStalled(uint256 id) external {
        Market storage m = _markets[id];
        require(m.state == State.Open && block.timestamp > m.expiry + STALL, "not stalled");
        m.state = State.Void;
        emit Voided(id);
    }

    function claimable(uint256 id, address who) public view returns (uint256) {
        Market storage m = _markets[id];
        if (claimed[id][who]) return 0;
        uint256[2] memory s = stake[id][who];
        if (m.state == State.Void) return s[0] + s[1];
        if (m.state != State.Settled) return 0;
        uint256 side = m.outcome ? 1 : 0;
        uint256 mine = weight[id][who][side];
        if (mine == 0) return 0;
        uint256 losPot = m.outcome ? m.noPot : m.yesPot;
        uint256 winW = m.outcome ? m.yesWeight : m.noWeight;
        uint256 prize = losPot - (losPot * FEE_BPS) / 10_000;
        return s[side] + (prize * mine) / winW;
    }

    function claim(uint256 id) external nonReentrant {
        uint256 amount = claimable(id, msg.sender);
        require(amount > 0, "nothing");
        claimed[id][msg.sender] = true;
        usdg.safeTransfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }
}
