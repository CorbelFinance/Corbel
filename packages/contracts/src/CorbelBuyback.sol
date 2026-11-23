// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min, IPoolManager, IV2Router, IWETH, PoolKey, SwapParams} from "./interfaces/External.sol";

/**
 * Buyback by a published rule. Every USDG sent here is spent on $CORBEL over the next week and the coins are burned:
 *
 *  - An epoch starts when the first slice runs after the last epoch ended: the balance then is split into SLICES equal
 *    parts, one per hour, so a week's money is spent across the week, not in one push of the price.
 *  - Each slice swaps USDG to WETH (V2), unwraps it and buys $CORBEL in the one pool fixed at deployment (the main
 *    ETH/$CORBEL v4 pool). Both legs carry a price bound inside the transaction (maxImpactBps), so one slice can never
 *    move a price further than that.
 *  - Every coin bought goes straight to the dead address. There is no withdraw, no owner and no way to change the pool,
 *    the share or the schedule: what goes in can only come out as burned $CORBEL.
 *  - Only the keeper named at deployment may run a slice, so nobody can wrap a slice in a trade of their own.
 */
contract CorbelBuyback is ReentrancyGuard {
    using SafeTransfer for address;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant SLICES = 168; // one an hour for a week
    uint160 internal constant MIN_SQRT = 4295128740;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    IPoolManager public immutable pm;
    IV2Router public immutable router;
    address public immutable usdg;
    address public immutable weth;
    address public immutable corbel;
    address public immutable keeper;
    uint16 public immutable maxImpactBps;
    PoolKey internal pool;

    uint256 public epochEnd;
    uint256 public perSlice;
    uint256 public lastSlice;
    uint256 public totalSpent; // USDG
    uint256 public totalBurned; // $CORBEL

    uint256 internal _ethIn;
    uint160 internal _limit;

    event EpochStarted(uint256 budget, uint256 perSlice, uint256 ends);
    event Burned(uint256 usdgIn, uint256 ethIn, uint256 corbelOut);

    constructor(IPoolManager pm_, IV2Router router_, address usdg_, address corbel_, PoolKey memory pool_, address keeper_, uint16 maxImpactBps_) {
        require(pool_.currency0 == address(0) && pool_.currency1 == corbel_, "pool must be ETH/CORBEL");
        require(maxImpactBps_ > 0 && maxImpactBps_ <= 500, "impact");
        pm = pm_;
        router = router_;
        usdg = usdg_;
        weth = router_.WETH();
        corbel = corbel_;
        pool = pool_;
        keeper = keeper_;
        maxImpactBps = maxImpactBps_;
    }

    receive() external payable {}

    function poolKey() external view returns (PoolKey memory) {
        return pool;
    }

    /// One hourly slice: USDG → WETH → ETH → $CORBEL, burned.
    function slice() external nonReentrant returns (uint256 burned) {
        require(msg.sender == keeper, "keeper");
        require(block.timestamp >= lastSlice + 1 hours, "hourly");
        uint256 bal = IERC20Min(usdg).balanceOf(address(this));
        if (block.timestamp >= epochEnd) {
            require(bal > 0, "nothing to spend");
            perSlice = bal / SLICES;
            if (perSlice == 0) perSlice = bal;
            epochEnd = block.timestamp + 7 days;
            emit EpochStarted(bal, perSlice, epochEnd);
        }
        uint256 amount = perSlice < bal ? perSlice : bal;
        require(amount > 0, "nothing to spend");
        lastSlice = block.timestamp;

        // leg 1: USDG -> WETH on V2, at most maxImpactBps worse than the pool's own quote this block
        address[] memory path = new address[](2);
        path[0] = usdg;
        path[1] = weth;
        uint256 q = router.getAmountsOut(amount, path)[1];
        usdg.safeApprove(address(router), amount);
        uint256[] memory got = router.swapExactTokensForTokens(amount, (q * (10_000 - maxImpactBps)) / 10_000, path, address(this), block.timestamp);
        uint256 ethIn = got[1];
        IWETH(weth).withdraw(ethIn);

        // leg 2: ETH -> $CORBEL in the fixed v4 pool, the price limit maxImpactBps above the price now
        uint160 sp = _sqrtPrice();
        require(sp > 0, "pool");
        uint256 move = (uint256(sp) * maxImpactBps) / 20_000; // sqrtP moves about half as much as the price
        uint160 lim = uint160(uint256(sp) - move); // buying currency1 with currency0 lowers sqrtP
        if (lim <= MIN_SQRT) lim = MIN_SQRT + 1;
        _ethIn = ethIn;
        _limit = lim;
        burned = abi.decode(pm.unlock(""), (uint256));
        corbel.safeTransfer(DEAD, burned);
        totalSpent += amount;
        totalBurned += burned;
        emit Burned(amount, ethIn, burned);
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        int256 d = pm.swap(pool, SwapParams(true, -int256(_ethIn), _limit), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        if (d0 < 0) pm.settle{value: uint256(uint128(-d0))}();
        uint256 out = d1 > 0 ? uint256(uint128(d1)) : 0;
        if (out > 0) pm.take(pool.currency1, address(this), out);
        // ETH the price limit left unspent stays here for the next slice
        return abi.encode(out);
    }

    function _sqrtPrice() internal view returns (uint160) {
        bytes32 id = keccak256(abi.encode(pool));
        return uint160(uint256(pm.extsload(keccak256(abi.encode(id, uint256(6))))));
    }
}
