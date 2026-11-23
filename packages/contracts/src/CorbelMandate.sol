// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "./lib/Math.sol";
import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min, IPoolManager, IV2Factory, IV2Pair, IV2Router, PoolKey, SwapParams} from "./interfaces/External.sol";

/**
 * Corbel mandate: an AI agent trades the owner's money under rules the contract enforces, and pays for
 * trying to break them.
 *
 * The owner funds the vault and writes the mandate. The agent posts a bond (USDG) before it may trade.
 * Every trade is checked against five skills:
 *   1 ASSETS   both sides must be listed
 *   2 SIZE     input at most `maxPerTrade` (per token)
 *   3 BUDGET   input at most `maxPerDay` per UTC day (per token), and at most `maxTotal` over the mandate's life
 *   4 PRICE    V2: minOut at least the pool's own quote minus `maxSlippageBps`;
 *              v4: the contract sets the price limit itself from the pool's current price, and only pools
 *              with a static fee of at most 1% and no hook (or a hook the owner approved) are allowed:
 *              a 99% fee or a hostile hook takes the money without moving the price
 *   5 WINDOW   UTC hours [hourFrom, hourTo), optional weekdays only, a cooldown between trades, and an end date
 *              (`endsAt`, set at most MAX_TERM ahead): after it every trade breaks the window
 *   6 POOL     every pool the trade touches (each V2 hop, the v4 pool) must be one the owner approved. Approval
 *              records the pool's price as the owner's mark; a trade reverts while the pool sits more than
 *              `maxSlippageBps` away from that mark, so an agent can neither route through a pool it made nor
 *              push an approved pool and trade against its own push. The vault's own fills move the mark;
 *              anything else that moves it is the owner's call (re-approve).
 *   7 SCORE    optional: with a score signer and a line set, the agent may buy a token (anything but the bond
 *              token, WETH and ETH) only with a Corbel score for it, signed (EIP-712) and at most SCORE_MAX_AGE old,
 *              at or above the line. Anyone may bring a signed score in with submitScore.
 * A trade that breaks a rule does not revert: nothing is swapped, the violation is recorded, `slashBps` of
 * the agent's bond goes to the owner, and after `strikesToFreeze` violations the agent is frozen and the
 * rest of its bond goes to the owner too. Output always stays in the vault. Only the owner withdraws.
 */
contract CorbelMandate is ReentrancyGuard {
    using SafeTransfer for address;

    enum Rule {
        None,
        Assets,
        Size,
        Budget,
        Price,
        Window,
        Bond,
        Pool,
        Score
    }

    struct Limit {
        bool allowed;
        uint128 maxPerTrade;
        uint128 maxPerDay;
    }

    struct Rules {
        uint16 maxSlippageBps; // PRICE
        uint8 hourFrom; // WINDOW, UTC, inclusive
        uint8 hourTo; // WINDOW, UTC, exclusive; hourFrom == hourTo means all day
        bool weekdaysOnly; // WINDOW: no trades Saturday and Sunday (UTC)
        uint32 cooldown; // WINDOW: seconds between trades
        uint128 minBond; // bond needed to trade, in bond-token units
        uint16 slashBps; // share of the bond taken per violation
        uint8 strikesToFreeze; // violations before the agent is frozen
    }

    event Traded(address indexed agent, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, string memo);
    event Violation(address indexed agent, Rule indexed rule, address tokenIn, address tokenOut, uint256 amountIn, uint256 slashed, uint8 strikes, string memo);
    event Frozen(address indexed agent, uint256 seized);
    event Bonded(address indexed agent, uint256 amount, uint256 total);
    event UnbondRequested(address indexed agent, uint256 amount, uint256 readyAt);
    event Unbonded(address indexed agent, uint256 amount);
    event AgentSet(address indexed agent);
    event LimitSet(address indexed token, bool allowed, uint256 maxPerTrade, uint256 maxPerDay);
    event RulesSet(Rules rules);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    uint256 public constant UNBOND_DELAY = 1 days;
    uint24 public constant MAX_POOL_FEE = 10_000; // 1%
    uint24 internal constant DYNAMIC_FEE = 0x800000;
    mapping(address => bool) public approvedHooks;
    event HookApproved(address indexed hook, bool approved);
    event PoolApproved(bytes32 indexed id, uint256 mark);
    event PoolRevoked(bytes32 indexed id);

    /// Owner-approved pools and the price recorded at approval (0 = not approved). V2: the pair address as bytes32
    /// and reserve1/reserve0 in Q96. v4: the pool id and sqrtPriceX96.
    mapping(bytes32 => uint256) public poolMark;
    uint160 internal constant MIN_SQRT = 4295128740;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    IV2Router public immutable router;
    IV2Factory public immutable v2Factory;
    IPoolManager public immutable pm;
    address public immutable bondToken;
    address public immutable owner;

    address public agent;
    bool public frozen;
    Rules public rules;
    mapping(address => Limit) public limits;
    mapping(address => mapping(uint256 => uint256)) public spentOnDay;
    /// BUDGET over the whole mandate, per token (0 = no total limit), and what has been spent of it
    mapping(address => uint256) public maxTotal;
    mapping(address => uint256) public spentTotal;
    /// WINDOW: no trade at or after this time (0 = no end date); never more than MAX_TERM after it was set
    uint256 public endsAt;
    uint256 public constant MAX_TERM = 90 days;
    event TotalSet(address indexed token, uint256 maxTotal);
    /// SCORE: who signs scores (0 = rule off), the line, and the latest signed score per token
    address public scoreSigner;
    uint8 public minScore;
    uint256 public constant SCORE_MAX_AGE = 10 minutes;
    struct Score {
        uint8 score;
        uint64 issuedAt;
    }
    mapping(address => Score) public scores;
    bytes32 public constant SCORE_TYPEHASH = keccak256("Score(address token,uint8 score,uint64 issuedAt)");
    /// one signature serves every mandate: the domain names the scorer and the chain, not this contract
    bytes32 public immutable SCORE_DOMAIN;
    address public immutable weth;
    event ScoreRuleSet(address signer, uint8 line);
    event ScoreSet(address indexed token, uint8 score, uint64 issuedAt);
    event EndSet(uint256 endsAt);
    uint256 public lastTradeAt;
    uint8 public strikes;

    uint256 public bond; // the agent's posted bond, slashable
    uint256 public unbondAmount; // part of `bond` the agent asked back
    uint256 public unbondReadyAt;

    // v4 swap in flight
    PoolKey internal _key;
    bool internal _zeroForOne;
    uint256 internal _amountIn;
    uint160 internal _limit;

    constructor(IV2Router router_, IPoolManager pm_, address bondToken_, address owner_, address agent_, Rules memory rules_) {
        require(rules_.maxSlippageBps <= 1_000 && rules_.slashBps <= 10_000 && rules_.strikesToFreeze > 0, "rules");
        require(rules_.hourFrom < 24 && rules_.hourTo <= 24, "hours");
        router = router_;
        v2Factory = IV2Factory(router_.factory());
        pm = pm_;
        bondToken = bondToken_;
        owner = owner_;
        agent = agent_;
        rules = rules_;
        weth = router_.WETH();
        SCORE_DOMAIN = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId)"), keccak256("Corbel score"), keccak256("1"), block.chainid));
    }

    receive() external payable {}

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    // ---------- owner ----------

    function setLimit(address token, bool allowed, uint128 maxPerTrade, uint128 maxPerDay) external onlyOwner {
        require(maxPerTrade <= maxPerDay, "limits");
        limits[token] = Limit(allowed, maxPerTrade, maxPerDay);
        emit LimitSet(token, allowed, maxPerTrade, maxPerDay);
    }

    /// The most the agent may spend of `token` over the mandate's whole life (0 lifts the total limit).
    function setTotal(address token, uint256 total) external onlyOwner {
        maxTotal[token] = total;
        emit TotalSet(token, total);
    }

    /// Turns the score rule on (a signer and a line from 1 to 100) or off (signer 0).
    function setScoreRule(address signer, uint8 line) external onlyOwner {
        require(signer == address(0) || (line > 0 && line <= 100), "line");
        scoreSigner = signer;
        minScore = signer == address(0) ? 0 : line;
        emit ScoreRuleSet(signer, minScore);
    }

    /// Anyone brings in a signed score; a newer one replaces an older one for the same token.
    function submitScore(address token, uint8 score, uint64 issuedAt, uint8 v, bytes32 r, bytes32 s) external {
        require(scoreSigner != address(0), "no scorer");
        require(issuedAt <= block.timestamp && score <= 100, "score");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", SCORE_DOMAIN, keccak256(abi.encode(SCORE_TYPEHASH, token, score, issuedAt))));
        address who = ecrecover(digest, v, r, s);
        require(who != address(0) && who == scoreSigner, "signer");
        if (issuedAt >= scores[token].issuedAt) {
            scores[token] = Score(score, issuedAt);
            emit ScoreSet(token, score, issuedAt);
        }
    }

    /// The mandate's end date: at most MAX_TERM from now (0 removes it).
    function setEnd(uint256 at) external onlyOwner {
        require(at == 0 || (at > block.timestamp && at <= block.timestamp + MAX_TERM), "term");
        endsAt = at;
        emit EndSet(at);
    }

    function approveHook(address hook, bool approved) external onlyOwner {
        approvedHooks[hook] = approved;
        emit HookApproved(hook, approved);
    }

    function v2PoolId(address a, address b) public view returns (bytes32) {
        return bytes32(uint256(uint160(v2Factory.getPair(a, b))));
    }

    function v4PoolId(PoolKey memory key) public pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    /// Approve the V2 pair of a and b at its current price (also used to move the mark).
    function approveV2Pool(address a, address b) external onlyOwner {
        address pair = v2Factory.getPair(a, b);
        require(pair != address(0), "no pair");
        uint256 mark = _v2Price(pair);
        require(mark > 0, "empty pair");
        bytes32 id = bytes32(uint256(uint160(pair)));
        poolMark[id] = mark;
        emit PoolApproved(id, mark);
    }

    /// Approve a v4 pool at its current price (also used to move the mark).
    function approveV4Pool(PoolKey calldata key) external onlyOwner {
        uint160 sp = _sqrtPrice(key);
        require(sp > 0, "pool not initialized");
        bytes32 id = v4PoolId(key);
        poolMark[id] = sp;
        emit PoolApproved(id, sp);
    }

    function revokePool(bytes32 id) external onlyOwner {
        delete poolMark[id];
        emit PoolRevoked(id);
    }

    function setRules(Rules calldata r) external onlyOwner {
        require(r.maxSlippageBps <= 1_000 && r.slashBps <= 10_000 && r.strikesToFreeze > 0, "rules");
        require(r.hourFrom < 24 && r.hourTo <= 24, "hours");
        rules = r;
        emit RulesSet(r);
    }

    /// Replace or revoke the agent at any time (address(0) stops all trading). Slashes are paid the moment a rule is
    /// broken, so whatever bond is left belongs to the old agent and goes back to it now; the owner never takes it.
    function setAgent(address a) external onlyOwner nonReentrant {
        address old = agent;
        uint256 back = bond;
        bond = 0;
        unbondAmount = 0;
        if (back > 0) bondToken.safeTransfer(old, back);
        agent = a;
        frozen = false;
        strikes = 0;
        emit AgentSet(a);
    }

    /// Owner's funds only: the agent's bond (and any part of it being unbonded) can't be taken this way.
    function withdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) {
            to.sendEth(amount);
        } else {
            uint256 free = IERC20Min(token).balanceOf(address(this)) - (token == bondToken ? bond : 0);
            require(amount <= free, "bond is not the owner's");
            token.safeTransfer(to, amount);
        }
        emit Withdrawn(token, to, amount);
    }

    // ---------- bond ----------

    function postBond(uint256 amount) external nonReentrant {
        require(msg.sender == agent && !frozen, "agent");
        uint256 before = IERC20Min(bondToken).balanceOf(address(this));
        bondToken.safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20Min(bondToken).balanceOf(address(this)) - before == amount, "bond taxed");
        bond += amount;
        emit Bonded(msg.sender, amount, bond);
    }

    /// Ask for part of the bond back. It stays slashable until it is withdrawn after UNBOND_DELAY.
    function requestUnbond(uint256 amount) external {
        require(msg.sender == agent, "agent");
        require(amount <= bond, "amount");
        unbondAmount = amount;
        unbondReadyAt = block.timestamp + UNBOND_DELAY;
        emit UnbondRequested(msg.sender, amount, unbondReadyAt);
    }

    function withdrawUnbonded() external nonReentrant {
        require(msg.sender == agent && !frozen, "agent");
        require(unbondAmount > 0 && block.timestamp >= unbondReadyAt, "not ready");
        uint256 amount = Math.min(unbondAmount, bond); // slashes in between come first
        unbondAmount = 0;
        bond -= amount;
        bondToken.safeTransfer(msg.sender, amount);
        emit Unbonded(msg.sender, amount);
    }

    // ---------- checks ----------

    function _windowOpen() internal view returns (bool) {
        Rules memory r = rules;
        if (r.cooldown > 0 && lastTradeAt != 0 && block.timestamp < lastTradeAt + r.cooldown) return false;
        if (r.weekdaysOnly) {
            uint256 dow = (block.timestamp / 1 days + 4) % 7; // 1970-01-01 was a Thursday: 0 = Sunday
            if (dow == 0 || dow == 6) return false;
        }
        if (r.hourFrom != r.hourTo) {
            uint256 h = (block.timestamp / 1 hours) % 24;
            bool inside = r.hourFrom < r.hourTo ? (h >= r.hourFrom && h < r.hourTo) : (h >= r.hourFrom || h < r.hourTo);
            if (!inside) return false;
        }
        return true;
    }

    /// The first rule a trade would break, or Rule.None. Pure read: the site and agents can ask before acting.
    function check(address tokenIn, address tokenOut, uint256 amountIn) public view returns (Rule) {
        if (bond < rules.minBond) return Rule.Bond;
        Limit memory li = limits[tokenIn];
        if (!li.allowed || !limits[tokenOut].allowed) return Rule.Assets;
        if (amountIn == 0 || amountIn > li.maxPerTrade) return Rule.Size;
        if (spentOnDay[tokenIn][block.timestamp / 1 days] + amountIn > li.maxPerDay) return Rule.Budget;
        if (maxTotal[tokenIn] != 0 && spentTotal[tokenIn] + amountIn > maxTotal[tokenIn]) return Rule.Budget;
        if (endsAt != 0 && block.timestamp >= endsAt) return Rule.Window;
        if (!_windowOpen()) return Rule.Window;
        if (minScore != 0 && tokenOut != bondToken && tokenOut != weth && tokenOut != address(0)) {
            Score memory sc = scores[tokenOut];
            if (sc.issuedAt == 0 || block.timestamp > sc.issuedAt + SCORE_MAX_AGE || sc.score < minScore) return Rule.Score;
        }
        return Rule.None;
    }

    function _violate(Rule rule, address tokenIn, address tokenOut, uint256 amountIn, string calldata memo) internal {
        uint256 cut = (bond * rules.slashBps) / 10_000;
        strikes += 1;
        if (cut > 0) {
            bond -= cut;
            bondToken.safeTransfer(owner, cut);
        }
        emit Violation(msg.sender, rule, tokenIn, tokenOut, amountIn, cut, strikes, memo);
        if (strikes >= rules.strikesToFreeze) {
            frozen = true;
            uint256 rest = bond;
            bond = 0;
            unbondAmount = 0;
            if (rest > 0) bondToken.safeTransfer(owner, rest);
            emit Frozen(msg.sender, rest);
        }
    }

    function _pre(address tokenIn, address tokenOut, uint256 amountIn, string calldata memo) internal returns (bool) {
        require(msg.sender == agent && agent != address(0), "agent");
        require(!frozen, "frozen");
        Rule r = check(tokenIn, tokenOut, amountIn);
        if (r != Rule.None) {
            _violate(r, tokenIn, tokenOut, amountIn, memo);
            return false;
        }
        spentOnDay[tokenIn][block.timestamp / 1 days] += amountIn;
        spentTotal[tokenIn] += amountIn;
        lastTradeAt = block.timestamp;
        return true;
    }

    /// A trade that _pre let through but a later rule stopped never happened: take it off the day's and the
    /// lifetime spend, so a refused trade never uses up the agent's budget.
    function _undo(address tokenIn, uint256 amountIn) internal {
        spentOnDay[tokenIn][block.timestamp / 1 days] -= amountIn;
        spentTotal[tokenIn] -= amountIn;
    }

    // ---------- trades ----------

    /// V2 route. Returns (true, out) when it traded, (false, 0) when a rule stopped it (and the bond paid).
    function tradeV2(address[] calldata path, uint256 amountIn, uint256 minOut, string calldata memo) external nonReentrant returns (bool ok, uint256 out) {
        require(path.length >= 2, "path");
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        if (!_pre(tokenIn, tokenOut, amountIn, memo)) return (false, 0);
        for (uint256 i = 0; i + 1 < path.length; i++) {
            address pair = v2Factory.getPair(path[i], path[i + 1]);
            uint256 mark = poolMark[bytes32(uint256(uint160(pair)))];
            if (pair == address(0) || mark == 0) {
                _undo(tokenIn, amountIn);
                _violate(Rule.Pool, tokenIn, tokenOut, amountIn, memo);
                return (false, 0);
            }
            require(_near(_v2Price(pair), mark, 10_000), "price moved from the owner's mark");
        }
        uint256[] memory q = router.getAmountsOut(amountIn, path);
        uint256 floor = (q[q.length - 1] * (10_000 - rules.maxSlippageBps)) / 10_000;
        if (minOut < floor) {
            // undo the bookkeeping of _pre: this trade never happens
            _undo(tokenIn, amountIn);
            _violate(Rule.Price, tokenIn, tokenOut, amountIn, memo);
            return (false, 0);
        }
        tokenIn.safeApprove(address(router), amountIn);
        uint256 before = IERC20Min(tokenOut).balanceOf(address(this));
        router.swapExactTokensForTokens(amountIn, minOut, path, address(this), block.timestamp);
        out = IERC20Min(tokenOut).balanceOf(address(this)) - before;
        // the vault's own fill moves the pools: the mark follows it, so the next honest trade is not blocked
        for (uint256 i = 0; i + 1 < path.length; i++) {
            address pair = v2Factory.getPair(path[i], path[i + 1]);
            poolMark[bytes32(uint256(uint160(pair)))] = _v2Price(pair);
        }
        emit Traded(msg.sender, tokenIn, tokenOut, amountIn, out, memo);
        return (true, out);
    }

    /// v4 single pool. The contract caps the price move itself: the swap stops at maxSlippageBps from the
    /// pool's current price, whatever the agent would have accepted. Unspent input stays in the vault.
    function tradeV4(PoolKey calldata key, address tokenIn, uint256 amountIn, string calldata memo) external nonReentrant returns (bool ok, uint256 out) {
        require(tokenIn == key.currency0 || tokenIn == key.currency1, "pool");
        address tokenOut = tokenIn == key.currency0 ? key.currency1 : key.currency0;
        if (!_pre(tokenIn, tokenOut, amountIn, memo)) return (false, 0);
        bool feeOk = (key.fee & DYNAMIC_FEE) == 0 && key.fee <= MAX_POOL_FEE;
        bool hookOk = key.hooks == address(0) || approvedHooks[key.hooks];
        if (!feeOk || !hookOk) {
            _undo(tokenIn, amountIn);
            _violate(Rule.Price, tokenIn, tokenOut, amountIn, memo);
            return (false, 0);
        }
        uint256 mark = poolMark[v4PoolId(key)];
        if (mark == 0) {
            _undo(tokenIn, amountIn);
            _violate(Rule.Pool, tokenIn, tokenOut, amountIn, memo);
            return (false, 0);
        }
        bool z = tokenIn == key.currency0;
        uint160 sp = _sqrtPrice(key);
        require(sp > 0, "pool not initialized");
        // sqrtP moves about half as much as the price
        require(_near(sp, mark, 20_000), "price moved from the owner's mark");
        // price = sqrtP^2: a move of s in price is ~s/2 in sqrtP; round the bound inward
        uint256 move = (uint256(sp) * rules.maxSlippageBps) / 20_000;
        uint160 lim = z ? uint160(uint256(sp) - move) : uint160(uint256(sp) + move);
        if (lim <= MIN_SQRT) lim = MIN_SQRT;
        if (lim >= MAX_SQRT) lim = MAX_SQRT;
        _key = key;
        _zeroForOne = z;
        _amountIn = amountIn;
        _limit = lim;
        out = abi.decode(pm.unlock(""), (uint256));
        poolMark[v4PoolId(key)] = _sqrtPrice(key); // the mark follows the vault's own fill
        emit Traded(msg.sender, tokenIn, tokenOut, amountIn, out, memo);
        return (true, out);
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        PoolKey memory key = _key;
        bool z = _zeroForOne;
        int256 d = pm.swap(key, SwapParams(z, -int256(_amountIn), _limit), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        int128 dIn = z ? d0 : d1;
        int128 dOut = z ? d1 : d0;
        address cin = z ? key.currency0 : key.currency1;
        address cout = z ? key.currency1 : key.currency0;
        if (dIn < 0) {
            uint256 pay = uint256(uint128(-dIn));
            if (cin == address(0)) {
                pm.settle{value: pay}();
            } else {
                pm.sync(cin);
                cin.safeTransfer(address(pm), pay);
                pm.settle();
            }
        }
        uint256 got = dOut > 0 ? uint256(uint128(dOut)) : 0;
        if (got > 0) pm.take(cout, address(this), got);
        return abi.encode(got);
    }

    /// |cur - mark| within maxSlippageBps of mark, with `scale` 10_000 for a price and 20_000 for a square root.
    function _near(uint256 cur, uint256 mark, uint256 scale) internal view returns (bool) {
        uint256 d = cur > mark ? cur - mark : mark - cur;
        return d * scale <= mark * rules.maxSlippageBps;
    }

    /// reserve1 / reserve0 in Q96.
    function _v2Price(address pair) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = IV2Pair(pair).getReserves();
        return r0 == 0 ? 0 : (uint256(r1) << 96) / r0;
    }

    function _sqrtPrice(PoolKey memory key) internal view returns (uint160) {
        bytes32 id = keccak256(abi.encode(key));
        return uint160(uint256(pm.extsload(keccak256(abi.encode(id, uint256(6))))));
    }
}

/// Deploys mandates and is the one place the site reads them from. No admin, holds nothing.
contract CorbelMandates {
    event Created(address indexed mandate, address indexed owner, address indexed agent);

    IV2Router public immutable router;
    IPoolManager public immutable pm;
    address public immutable bondToken;

    constructor(IV2Router router_, IPoolManager pm_, address bondToken_) {
        router = router_;
        pm = pm_;
        bondToken = bondToken_;
    }

    function create(address agent, CorbelMandate.Rules calldata rules) external returns (CorbelMandate m) {
        m = new CorbelMandate(router, pm, bondToken, msg.sender, agent, rules);
        emit Created(address(m), msg.sender, agent);
    }
}
