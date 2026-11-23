// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min, IV2Router} from "./interfaces/External.sol";

interface IVault4626 {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/**
 * Corbel One, spend in one step: redeem Corbel One shares and swap the USDG they hold into any token in one
 * transaction. The owner approves this helper for the shares once; each spend redeems exactly the shares named,
 * swaps through the V2 router on the owner's path with the owner's floor, and sends the output where the owner says.
 * The helper keeps nothing between calls and has no owner or admin.
 */
contract CorbelSpend is ReentrancyGuard {
    using SafeTransfer for address;

    IV2Router public immutable router;

    event Spent(address indexed owner, address indexed vault, uint256 shares, uint256 assets, address tokenOut, uint256 amountOut, address to);

    constructor(IV2Router router_) {
        router = router_;
    }

    function spend(IVault4626 vault, uint256 shares, address[] calldata path, uint256 minOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 out)
    {
        address asset = vault.asset();
        require(path.length >= 2 && path[0] == asset, "path");
        uint256 assets = vault.redeem(shares, address(this), msg.sender);
        asset.safeApprove(address(router), assets);
        address tokenOut = path[path.length - 1];
        uint256 had = IERC20Min(tokenOut).balanceOf(to);
        router.swapExactTokensForTokens(assets, minOut, path, to, deadline);
        out = IERC20Min(tokenOut).balanceOf(to) - had;
        require(out >= minOut, "below floor");
        emit Spent(msg.sender, address(vault), shares, assets, tokenOut, out, to);
    }
}
