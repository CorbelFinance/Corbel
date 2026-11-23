// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelBuyback} from "../../src/CorbelBuyback.sol";
import {IERC20Min, IPoolManager, IV2Router, IWETH, PoolKey} from "../../src/interfaces/External.sol";

contract BuybackForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant CORBEL = 0xAA1f4De6b9f7cDf11FB8AA97ce163D35D731CdB1;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    CorbelBuyback b;
    address keeper = address(0x4EE9);

    function setUp() public {
        b = new CorbelBuyback(PM, ROUTER, USDG, CORBEL, PoolKey(address(0), CORBEL, 0, 200, HOOK), keeper, 300);
        // 168 USDG of "revenue" into the buyback: 1 USDG a slice
        address funder = address(0xF00D);
        vm.deal(funder, 1 ether);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        vm.startPrank(funder);
        IWETH(WETH).deposit{value: 0.5 ether}();
        IERC20Min(WETH).approve(address(ROUTER), 0.5 ether);
        ROUTER.swapExactTokensForTokens(0.5 ether, 1, p, funder, block.timestamp + 60);
        IERC20Min(USDG).transfer(address(b), 168e6);
        vm.stopPrank();
    }

    function test_aSliceBuysAndBurnsHourlyAndOnlyTheKeeperRunsIt() public {
        uint256 dead0 = IERC20Min(CORBEL).balanceOf(DEAD);
        vm.expectRevert(bytes("keeper"));
        b.slice();
        vm.prank(keeper);
        uint256 burned = b.slice();
        ok(burned > 0, "bought some");
        eq(IERC20Min(CORBEL).balanceOf(DEAD) - dead0, burned, "all of it to the dead address");
        eq(IERC20Min(CORBEL).balanceOf(address(b)), 0, "none kept");
        eq(b.perSlice(), 1e6, "a week split in hours");
        eq(IERC20Min(USDG).balanceOf(address(b)), 167e6, "one slice spent");
        vm.prank(keeper);
        vm.expectRevert(bytes("hourly"));
        b.slice();
        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        ok(b.slice() > 0, "next hour, next slice");
        eq(b.totalSpent(), 2e6, "two slices spent");
    }
}
