// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min, IV2Router} from "./interfaces/External.sol";

/**
 * Orders that wait for your price. One primitive covers three order types:
 *
 *   limit  fills = 1, interval = 0         one fill when the pool pays at least `minOutPerFill`
 *   DCA    fills = n, interval = 1 day     a fixed slice every interval, each with its own floor
 *   TWAP   fills = n, interval = minutes   the same, on a short clock
 *
 * The input is escrowed here. Anyone (a keeper, a filler, the owner) may execute a due fill through the
 * V2 router and earns `tipBps` of that slice. Output always goes straight to the owner. The owner can
 * cancel at any moment and gets the unfilled input back. There is no admin.
 */
contract CorbelOrders is ReentrancyGuard {
    using SafeTransfer for address;

    struct Order {
        address owner;
        address tokenIn;
        address tokenOut;
        uint96 fillsLeft;
        uint128 amountPerFill; // input per slice, tip included
        uint128 minOutPerFill; // the price floor for one slice, in tokenOut units
        uint32 interval; // seconds between slices
        uint32 nextAt; // earliest time for the next slice
        uint32 expiry; // no fill after this time (0 = none)
        uint16 tipBps; // filler's share of each slice, at most 1%
    }

    event Placed(uint256 indexed id, address indexed owner, address tokenIn, address tokenOut, uint256 fills, uint256 amountPerFill, uint256 minOutPerFill, uint256 interval);
    event Filled(uint256 indexed id, address indexed filler, uint256 amountIn, uint256 amountOut, uint256 tip, uint256 fillsLeft);
    event Cancelled(uint256 indexed id, uint256 refund);

    IV2Router public immutable router;
    uint16 public constant MAX_TIP_BPS = 100;
    uint256 public nextId = 1;
    mapping(uint256 => Order) public orders;

    constructor(IV2Router router_) {
        router = router_;
    }

    function place(
        address tokenIn,
        address tokenOut,
        uint96 fills,
        uint128 amountPerFill,
        uint128 minOutPerFill,
        uint32 interval,
        uint32 expiry,
        uint16 tipBps
    ) external nonReentrant returns (uint256 id) {
        require(tokenIn != tokenOut && tokenIn != address(0) && tokenOut != address(0), "tokens");
        require(fills > 0 && amountPerFill > 0 && minOutPerFill > 0, "sizes");
        require(tipBps <= MAX_TIP_BPS, "tip");
        require(fills == 1 || interval > 0, "interval");
        require(expiry == 0 || expiry > block.timestamp, "expiry");
        uint256 total = uint256(fills) * amountPerFill;
        uint256 before = IERC20Min(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), total);
        require(IERC20Min(tokenIn).balanceOf(address(this)) - before == total, "input taxed");
        id = nextId++;
        orders[id] = Order(msg.sender, tokenIn, tokenOut, fills, amountPerFill, minOutPerFill, interval, uint32(block.timestamp), expiry, tipBps);
        emit Placed(id, msg.sender, tokenIn, tokenOut, fills, amountPerFill, minOutPerFill, interval);
    }

    /// True when a slice of `id` may be filled now. `quote` is what the pool would pay for it via `path`.
    function due(uint256 id, address[] calldata path) external view returns (bool ready, uint256 quote) {
        Order memory o = orders[id];
        if (o.fillsLeft == 0 || block.timestamp < o.nextAt || (o.expiry != 0 && block.timestamp > o.expiry)) return (false, 0);
        uint256 net = o.amountPerFill - (uint256(o.amountPerFill) * o.tipBps) / 10_000;
        uint256[] memory amts = router.getAmountsOut(net, path);
        quote = amts[amts.length - 1];
        ready = quote >= o.minOutPerFill;
    }

    function fill(uint256 id, address[] calldata path, uint256 deadline) external nonReentrant returns (uint256 out) {
        Order storage o = orders[id];
        require(o.fillsLeft > 0, "done");
        require(block.timestamp >= o.nextAt, "not yet");
        require(o.expiry == 0 || block.timestamp <= o.expiry, "expired");
        require(path.length >= 2 && path[0] == o.tokenIn && path[path.length - 1] == o.tokenOut, "path");

        uint256 tip = (uint256(o.amountPerFill) * o.tipBps) / 10_000;
        uint256 net = o.amountPerFill - tip;
        o.fillsLeft -= 1;
        o.nextAt = uint32(block.timestamp) + o.interval;

        o.tokenIn.safeApprove(address(router), net);
        uint256 before = IERC20Min(o.tokenOut).balanceOf(o.owner);
        router.swapExactTokensForTokens(net, o.minOutPerFill, path, o.owner, deadline);
        // measure what reached the owner: the floor holds even for taxed output tokens
        out = IERC20Min(o.tokenOut).balanceOf(o.owner) - before;
        require(out >= o.minOutPerFill, "below limit");
        if (tip > 0) o.tokenIn.safeTransfer(msg.sender, tip);
        emit Filled(id, msg.sender, net, out, tip, o.fillsLeft);
    }

    function cancel(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        require(msg.sender == o.owner, "owner");
        uint256 refund = uint256(o.fillsLeft) * o.amountPerFill;
        o.fillsLeft = 0;
        if (refund > 0) o.tokenIn.safeTransfer(o.owner, refund);
        emit Cancelled(id, refund);
    }
}
