// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelVault} from "../../src/CorbelVault.sol";
import {CorbelSpend, IVault4626} from "../../src/CorbelSpend.sol";
import {IERC20Min, IV2Router, IWETH} from "../../src/interfaces/External.sol";

contract SpendForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    CorbelVault vault;
    CorbelSpend sp;
    address me = address(0xA11);

    function setUp() public {
        vault = new CorbelVault(USDG, address(this), 1_000_000e6);
        sp = new CorbelSpend(ROUTER);
        vm.deal(me, 1 ether);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        vm.startPrank(me);
        IWETH(WETH).deposit{value: 0.2 ether}();
        IERC20Min(WETH).approve(address(ROUTER), 0.2 ether);
        ROUTER.swapExactTokensForTokens(0.2 ether, 1, p, me, block.timestamp + 60);
        IERC20Min(USDG).approve(address(vault), 100e6);
        vault.deposit(100e6, me);
        vault.approve(address(sp), type(uint256).max);
        vm.stopPrank();
    }

    function test_spendsHalfTheBalanceIntoWethInOneStep() public {
        address[] memory p = new address[](2);
        p[0] = USDG;
        p[1] = WETH;
        uint256 half = vault.balanceOf(me) / 2;
        uint256 w0 = IERC20Min(WETH).balanceOf(me);
        vm.prank(me);
        uint256 out = sp.spend(IVault4626(address(vault)), half, p, 1, me, block.timestamp + 60);
        ok(out > 0, "WETH bought");
        eq(IERC20Min(WETH).balanceOf(me) - w0, out, "to the owner");
        eq(vault.balanceOf(me), half, "half the shares left");
        eq(IERC20Min(USDG).balanceOf(address(sp)), 0, "helper keeps nothing");
    }

    function test_nobodyElseSpendsYourShares() public {
        address[] memory p = new address[](2);
        p[0] = USDG;
        p[1] = WETH;
        vm.prank(address(0xBAD));
        vm.expectRevert();
        sp.spend(IVault4626(address(vault)), 1e6, p, 1, address(0xBAD), block.timestamp + 60);
    }
}
