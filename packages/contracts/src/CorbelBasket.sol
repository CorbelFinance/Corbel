// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20Min, IV2Router} from "./interfaces/External.sol";
import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";

/**
 * Stock baskets: buy several tokens in one transaction, weighted the way the buyer chooses.
 *
 * The buyer approves `amountIn` of one input token. The input is split by `weightsBps` (they must add up to 10,000;
 * the last token takes the rounding), and each part is swapped through the V2 router on the path the buyer gives
 * for it. Every output goes straight to the buyer, each with its own floor. Nothing is kept here between calls:
 * no fee, no owner, no admin, no balance.
 */
contract CorbelBasket is ReentrancyGuard {
    using SafeTransfer for address;

    IV2Router public immutable router;
    uint256 public constant MAX_TOKENS = 10;

    event Bought(address indexed buyer, address indexed tokenIn, uint256 amountIn, address[] tokens, uint256[] amountsOut);

    constructor(IV2Router router_) {
        router = router_;
    }

    /// @param paths for each basket token, the swap path from tokenIn to it (first = tokenIn, last = the token)
    function buy(address tokenIn, uint256 amountIn, address[][] calldata paths, uint16[] calldata weightsBps, uint256[] calldata minOuts, uint256 deadline)
        external
        nonReentrant
        returns (uint256[] memory outs)
    {
        uint256 n = paths.length;
        require(n > 0 && n <= MAX_TOKENS && weightsBps.length == n && minOuts.length == n, "lengths");
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            require(paths[i].length >= 2 && paths[i][0] == tokenIn, "path");
            sum += weightsBps[i];
        }
        require(sum == 10_000, "weights");
        uint256 before = IERC20Min(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        require(IERC20Min(tokenIn).balanceOf(address(this)) - before == amountIn, "input taxed");
        tokenIn.safeApprove(address(router), amountIn);

        outs = new uint256[](n);
        address[] memory tokens = new address[](n);
        uint256 left = amountIn;
        for (uint256 i = 0; i < n; i++) {
            uint256 part = i == n - 1 ? left : (amountIn * weightsBps[i]) / 10_000;
            left -= part;
            address out = paths[i][paths[i].length - 1];
            tokens[i] = out;
            if (part == 0) continue;
            uint256 had = IERC20Min(out).balanceOf(msg.sender);
            router.swapExactTokensForTokens(part, minOuts[i], paths[i], msg.sender, deadline);
            outs[i] = IERC20Min(out).balanceOf(msg.sender) - had;
            require(outs[i] >= minOuts[i], "below floor");
        }
        emit Bought(msg.sender, tokenIn, amountIn, tokens, outs);
    }
}
