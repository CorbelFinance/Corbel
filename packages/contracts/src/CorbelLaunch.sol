// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "./lib/ERC20.sol";
import {Math} from "./lib/Math.sol";
import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IPoolManager, ModifyLiquidityParams, PoolKey, SwapParams} from "./interfaces/External.sol";

/**
 * Launch token: fixed supply minted once to its sale, no owner, no mint, no fee, no blacklist.
 * Until the sale graduates, tokens only move to or from the sale. The v4 pool itself is guarded by CorbelLaunchGate:
 * only the sale may initialize it or add liquidity before graduation, so nobody can park a price in it early.
 */
contract CorbelToken is ERC20 {
    address public immutable sale;
    bool public open;

    constructor(string memory n, string memory s, uint256 supply) ERC20(n, s, 18) {
        sale = msg.sender;
        _mint(msg.sender, supply);
    }

    function openTransfers() external {
        require(msg.sender == sale, "sale");
        open = true;
    }

    function _beforeTransfer(address from, address to) internal view override {
        if (!open) require(from == sale || to == sale, "locked until graduation");
    }
}

/**
 * One launch: a two-way bonding curve with a deadline, then a Uniswap v4 pool with locked liquidity.
 *
 *  Live       buy and sell on the curve (1% fee each way).
 *  Failed     the deadline passed before the curve sold out: sell back with no fee. The curve always
 *             holds enough ETH to buy every token back (constant product on virtual reserves).
 *  Graduated  the curve sold out: all raised ETH and the reserved tokens become full-range liquidity in a
 *             v4 pool. The position belongs to this contract, which has no function to remove it.
 *
 * Price: (vE0 + raised) * (vT0 - sold) = vE0 * vT0, with vT0 = 1.25 × curve supply and vE0 = target / 4,
 * so the curve sells out exactly at `target` and the last price is 25× the first.
 */
contract CorbelSale is ReentrancyGuard {
    using SafeTransfer for address;

    event Bought(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event Sold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee);
    event Graduated(uint160 sqrtPriceX96, uint128 liquidity, uint256 ethIn, uint256 tokensIn, uint256 burned);

    uint256 public constant SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE = 800_000_000e18;
    uint256 public constant LP = 200_000_000e18;
    uint256 public constant FEE_BPS = 100;
    uint24 public constant POOL_FEE = 10_000;
    int24 public constant SPACING = 200;
    int24 public constant TICK_LO = -887_200;
    int24 public constant TICK_HI = 887_200;
    uint160 internal constant SQRT_LO = 4_310_618_291;
    uint160 internal constant SQRT_HI = 1_456_195_216_270_955_103_182_949_462_556_801_019_286_893_565_306;
    uint256 internal constant Q96 = 2 ** 96;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable pm;
    address public immutable gate;
    CorbelToken public immutable token;
    address public immutable creator;
    address public immutable feeTo;
    uint256 public immutable target;
    uint256 public immutable deadline;
    uint256 public immutable vE0;
    uint256 public immutable vT0;

    uint256 public raised;
    uint256 public sold;
    bool public graduated;
    uint128 public lockedLiquidity;

    enum State {
        Live,
        Failed,
        Graduated
    }

    constructor(IPoolManager pm_, address gate_, string memory name_, string memory symbol_, address creator_, address feeTo_, uint256 target_, uint256 deadline_) {
        require(target_ >= 0.1 ether && target_ <= 10_000 ether, "target");
        require(deadline_ > block.timestamp, "deadline");
        pm = pm_;
        gate = gate_;
        creator = creator_;
        feeTo = feeTo_;
        target = target_;
        deadline = deadline_;
        vT0 = (CURVE * 5) / 4;
        vE0 = target_ / 4;
        token = new CorbelToken(name_, symbol_, SUPPLY);
    }

    receive() external payable {
        require(msg.sender == address(pm), "use buy()");
    }

    function state() public view returns (State) {
        if (graduated) return State.Graduated;
        return block.timestamp > deadline ? State.Failed : State.Live;
    }

    function _k() internal view returns (uint256) {
        return vE0 * vT0;
    }

    /// Tokens out and ETH actually used for `ethIn` (the rest is refunded when the curve sells out).
    function quoteBuy(uint256 ethIn) public view returns (uint256 out, uint256 used, uint256 fee) {
        fee = (ethIn * FEE_BPS) / 10_000;
        uint256 net = ethIn - fee;
        uint256 vE = vE0 + raised;
        uint256 vT = vT0 - sold;
        out = vT - Math.mulDivUp(_k(), 1, vE + net);
        if (sold + out > CURVE) {
            // only what is left: the ETH that buys exactly the remainder
            out = CURVE - sold;
            net = Math.mulDivUp(_k(), 1, vT0 - CURVE) - vE;
            fee = Math.mulDivUp(net, FEE_BPS, 10_000 - FEE_BPS);
            // rounding up may ask for a wei more than was sent: take it from the fee, never from the curve
            if (net + fee > ethIn) fee = ethIn - net;
        }
        used = net + fee;
    }

    function quoteSell(uint256 amount) public view returns (uint256 out, uint256 fee) {
        uint256 vE = vE0 + raised;
        uint256 gross = vE - Math.mulDivUp(_k(), 1, vT0 - sold + amount);
        fee = state() == State.Live ? (gross * FEE_BPS) / 10_000 : 0;
        out = gross - fee;
    }

    function buy(uint256 minOut) external payable nonReentrant returns (uint256 out) {
        require(state() == State.Live, "not live");
        uint256 used;
        uint256 fee;
        (out, used, fee) = quoteBuy(msg.value);
        require(out > 0 && out >= minOut, "slippage");
        raised += used - fee;
        sold += out;
        address(token).safeTransfer(msg.sender, out);
        if (fee > 0) feeTo.sendEth(fee);
        if (msg.value > used) msg.sender.sendEth(msg.value - used);
        emit Bought(msg.sender, used, out, fee);
        if (sold == CURVE) _graduate();
    }

    function sell(uint256 amount, uint256 minOut) external nonReentrant returns (uint256 out) {
        require(!graduated, "graduated: trade on the pool");
        require(amount > 0 && amount <= sold, "amount");
        uint256 fee;
        (out, fee) = quoteSell(amount);
        require(out >= minOut, "slippage");
        address(token).safeTransferFrom(msg.sender, address(this), amount);
        sold -= amount;
        raised -= out + fee;
        if (fee > 0) feeTo.sendEth(fee);
        msg.sender.sendEth(out);
        emit Sold(msg.sender, amount, out, fee);
    }

    /// Anyone may finish a sold-out sale (normally the last buy does it).
    function graduate() external nonReentrant {
        require(!graduated && sold == CURVE, "not sold out");
        _graduate();
    }

    function poolKey() public view returns (PoolKey memory) {
        return PoolKey(address(0), address(token), POOL_FEE, SPACING, gate);
    }

    /// Curve's last price as a v4 sqrtPriceX96 (token per ETH, ETH is currency0).
    function targetSqrtPrice() public view returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(vT0 - sold, 2 ** 192, vE0 + raised)));
    }

    function _graduate() internal {
        graduated = true;
        uint160 sp = targetSqrtPrice();
        pm.unlock(abi.encode(sp));
        // leftovers: unused LP tokens are burned, ETH dust goes to the creator
        uint256 left = token.balanceOf(address(this));
        if (left > 0) address(token).safeTransfer(DEAD, left);
        if (address(this).balance > 0) creator.sendEth(address(this).balance);
        token.openTransfers();
        emit Graduated(sp, lockedLiquidity, raised, LP, left);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        uint160 sp = abi.decode(data, (uint160));
        PoolKey memory key = poolKey();

        // the gate lets only this sale initialize the pool, so it is always fresh and starts at the curve's price
        pm.initialize(key, sp);

        uint256 a0 = address(this).balance;
        uint256 a1 = token.balanceOf(address(this));
        uint256 l0 = Math.mulDiv(a0, Math.mulDiv(sp, SQRT_HI, Q96), SQRT_HI - sp);
        uint256 l1 = Math.mulDiv(a1, Q96, sp - SQRT_LO);
        uint256 liq = (Math.min(l0, l1) * 999) / 1000;
        require(liq > 0 && liq < type(uint128).max, "liquidity");
        lockedLiquidity = uint128(liq);

        (int256 delta,) = pm.modifyLiquidity(key, ModifyLiquidityParams(TICK_LO, TICK_HI, int256(liq), bytes32(0)), "");
        _settle(key, delta);
        return "";
    }

    function _sqrtPrice(PoolKey memory key) internal view returns (uint160) {
        bytes32 id = keccak256(abi.encode(key));
        bytes32 slot0 = pm.extsload(keccak256(abi.encode(id, uint256(6))));
        return uint160(uint256(slot0));
    }

    /// Pay what the pool manager is owed, take what it owes. Delta: amount0 in the high 128 bits.
    function _settle(PoolKey memory key, int256 delta) internal {
        int128 d0 = int128(delta >> 128);
        int128 d1 = int128(delta);
        if (d0 < 0) pm.settle{value: uint256(uint128(-d0))}();
        if (d1 < 0) {
            pm.sync(key.currency1);
            key.currency1.safeTransfer(address(pm), uint256(uint128(-d1)));
            pm.settle();
        }
        if (d0 > 0) pm.take(key.currency0, address(this), uint256(uint128(d0)));
        if (d1 > 0) pm.take(key.currency1, address(this), uint256(uint128(d1)));
    }
}

/**
 * v4 hook on every Corbel launch pool. Before its sale graduates, only the sale may initialize the pool or add
 * liquidity to it; after graduation the pool is open to everyone. It has no other hook and holds nothing.
 * Its address carries exactly the beforeInitialize and beforeAddLiquidity flags (v4 reads permissions from it).
 */
contract CorbelLaunchGate {
    uint160 public constant FLAGS = (1 << 13) | (1 << 11); // beforeInitialize | beforeAddLiquidity
    IPoolManager public immutable pm;
    CorbelLaunchpad public immutable launchpad;

    constructor(IPoolManager pm_) {
        pm = pm_;
        launchpad = CorbelLaunchpad(msg.sender);
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external view returns (bytes4) {
        require(msg.sender == address(pm), "pm");
        address s = launchpad.saleOf(key.currency1);
        require(s != address(0) && sender == s && key.currency0 == address(0), "only the sale opens this pool");
        return this.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata) external view returns (bytes4) {
        require(msg.sender == address(pm), "pm");
        address s = launchpad.saleOf(key.currency1);
        require(s != address(0) && (sender == s || CorbelSale(payable(s)).graduated()), "pool opens at graduation");
        return this.beforeAddLiquidity.selector;
    }
}

/// Factory. Holds no funds and has no admin: every sale is independent.
contract CorbelLaunchpad {
    event Launched(address indexed sale, address indexed token, address indexed creator, uint256 target, uint256 deadline);

    IPoolManager public immutable pm;
    address public immutable feeTo;
    CorbelLaunchGate public immutable gate;
    uint256 public constant MAX_DURATION = 30 days;
    mapping(address => address) public saleOf; // token => its sale

    /// Deploys the gate with CREATE2, searching salts until its address carries exactly the gate's hook flags.
    constructor(IPoolManager pm_, address feeTo_) {
        pm = pm_;
        feeTo = feeTo_;
        bytes32 h = keccak256(abi.encodePacked(type(CorbelLaunchGate).creationCode, abi.encode(pm_)));
        uint256 salt;
        for (;; salt++) {
            address a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, h)))));
            if (uint160(a) & 0x3FFF == (1 << 13) | (1 << 11)) break;
            require(salt < 400_000, "salt");
        }
        gate = new CorbelLaunchGate{salt: bytes32(salt)}(pm_);
        require(uint160(address(gate)) & 0x3FFF == (1 << 13) | (1 << 11), "gate address");
    }

    function launch(string calldata name, string calldata symbol, uint256 target, uint256 duration) external returns (CorbelSale sale) {
        require(duration >= 1 hours && duration <= MAX_DURATION, "duration");
        require(bytes(name).length > 0 && bytes(name).length <= 64 && bytes(symbol).length > 0 && bytes(symbol).length <= 16, "name");
        sale = new CorbelSale(pm, address(gate), name, symbol, msg.sender, feeTo, target, block.timestamp + duration);
        saleOf[address(sale.token())] = address(sale);
        emit Launched(address(sale), address(sale.token()), msg.sender, target, block.timestamp + duration);
    }
}
