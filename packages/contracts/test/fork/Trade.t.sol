// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelOrders} from "../../src/CorbelOrders.sol";
import {CorbelAgentVault} from "../../src/CorbelAgentVault.sol";
import {IERC20Min, IV2Router, IWETH} from "../../src/interfaces/External.sol";

abstract contract ForkTokens is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    function _weth(address who, uint256 amount) internal {
        vm.deal(who, amount);
        vm.prank(who);
        IWETH(WETH).deposit{value: amount}();
    }

    function _path() internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
    }

    function _quote(uint256 amountIn) internal view returns (uint256) {
        return ROUTER.getAmountsOut(amountIn, _path())[1];
    }
}

contract OrdersForkTest is ForkTokens {
    CorbelOrders orders;
    address alice = address(0xA11CE2);
    address keeper = address(0x4EE9E7);

    function setUp() public {
        orders = new CorbelOrders(ROUTER);
        _weth(alice, 5 ether);
        vm.prank(alice);
        IERC20Min(WETH).approve(address(orders), type(uint256).max);
    }

    function test_limitFillsAtOrAboveThePrice() public {
        uint256 slice = 0.1 ether;
        uint256 net = slice - (slice * 10) / 10_000;
        uint128 floor = uint128((_quote(net) * 99) / 100);
        vm.prank(alice);
        uint256 id = orders.place(WETH, USDG, 1, uint128(slice), floor, 0, 0, 10);
        (bool ready,) = orders.due(id, _path());
        ok(ready, "due");

        uint256 before = IERC20Min(USDG).balanceOf(alice);
        vm.prank(keeper);
        uint256 out = orders.fill(id, _path(), block.timestamp);
        gte(out, floor, "at or above the limit");
        eq(IERC20Min(USDG).balanceOf(alice) - before, out, "output goes to the owner");
        eq(IERC20Min(WETH).balanceOf(keeper), (slice * 10) / 10_000, "keeper tip");
        vm.prank(keeper);
        vm.expectRevert(bytes("done"));
        orders.fill(id, _path(), block.timestamp);
    }

    function test_limitAboveMarketWaits() public {
        uint128 floor = uint128((_quote(0.1 ether) * 3) / 2);
        vm.prank(alice);
        uint256 id = orders.place(WETH, USDG, 1, 0.1 ether, floor, 0, 0, 0);
        (bool ready,) = orders.due(id, _path());
        ok(!ready, "not due at this price");
        vm.prank(keeper);
        vm.expectRevert();
        orders.fill(id, _path(), block.timestamp);
    }

    function test_dcaKeepsItsClockAndCancelRefunds() public {
        uint128 floor = uint128(_quote(0.05 ether) / 2);
        vm.prank(alice);
        uint256 id = orders.place(WETH, USDG, 3, 0.05 ether, floor, 1 hours, 0, 0);
        vm.prank(keeper);
        orders.fill(id, _path(), block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(bytes("not yet"));
        orders.fill(id, _path(), block.timestamp);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        orders.fill(id, _path(), block.timestamp);

        vm.prank(keeper);
        vm.expectRevert(bytes("owner"));
        orders.cancel(id);
        uint256 before = IERC20Min(WETH).balanceOf(alice);
        vm.prank(alice);
        orders.cancel(id);
        eq(IERC20Min(WETH).balanceOf(alice) - before, 0.05 ether, "one unfilled slice back");
    }

    function test_pathMustMatchTheOrder() public {
        vm.prank(alice);
        uint256 id = orders.place(WETH, USDG, 1, 0.1 ether, 1, 0, 0, 0);
        address[] memory wrong = new address[](2);
        wrong[0] = USDG;
        wrong[1] = WETH;
        vm.prank(keeper);
        vm.expectRevert(bytes("path"));
        orders.fill(id, wrong, block.timestamp);
    }
}

contract AgentForkTest is ForkTokens {
    CorbelAgentVault vault;
    address owner = address(0x0B0B0B);
    address agent = address(0xA6E47);

    function setUp() public {
        vault = new CorbelAgentVault(ROUTER, owner, agent, 100);
        _weth(owner, 3 ether);
        vm.prank(owner);
        IERC20Min(WETH).transfer(address(vault), 3 ether);
        vm.startPrank(owner);
        vault.setLimit(WETH, true, 0.5 ether, 1 ether);
        vault.setLimit(USDG, true, 1_000e6, 2_000e6);
        vault.approvePair(WETH, USDG, true);
        vm.stopPrank();
    }

    function _trade(uint256 amount, uint256 minOut) internal returns (uint256) {
        vm.prank(agent);
        return vault.trade(_path(), amount, minOut, "test");
    }

    function test_tradeWithinLimitsStaysInTheVault() public {
        uint256 q = _quote(0.3 ether);
        uint256 out = _trade(0.3 ether, (q * 9_950) / 10_000);
        gte(out, (q * 9_950) / 10_000, "filled");
        eq(IERC20Min(USDG).balanceOf(address(vault)), out, "output stays in the vault");
        eq(IERC20Min(USDG).balanceOf(agent), 0, "agent got nothing");
    }

    function test_perTradeAndDailyCaps() public {
        vm.prank(agent);
        vm.expectRevert(bytes("trade too large"));
        vault.trade(_path(), 0.6 ether, 1, "too big");

        _trade(0.5 ether, (_quote(0.5 ether) * 9_950) / 10_000);
        _trade(0.5 ether, (_quote(0.5 ether) * 9_950) / 10_000);
        uint256 q = _quote(0.1 ether);
        vm.prank(agent);
        vm.expectRevert(bytes("daily limit"));
        vault.trade(_path(), 0.1 ether, q, "over the day");
        vm.warp(block.timestamp + 1 days);
        _trade(0.1 ether, (_quote(0.1 ether) * 9_950) / 10_000);
    }

    function test_onlyOwnerApprovedPairs() public {
        vm.prank(owner);
        vault.approvePair(WETH, USDG, false);
        uint256 q = _quote(0.1 ether);
        vm.prank(agent);
        vm.expectRevert(bytes("pool not approved"));
        vault.trade(_path(), 0.1 ether, q, "pair the owner did not approve");
    }

    function test_slippageBoundIsEnforced() public {
        uint256 q = _quote(0.2 ether);
        vm.prank(agent);
        vm.expectRevert(bytes("slippage above limit"));
        vault.trade(_path(), 0.2 ether, (q * 98) / 100, "too loose");
    }

    function test_unlistedTokenAndStrangers() public {
        vm.prank(owner);
        vault.setLimit(USDG, false, 0, 0);
        vm.prank(agent);
        vm.expectRevert(bytes("token not listed"));
        vault.trade(_path(), 0.1 ether, 1, "unlisted");
        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("agent"));
        vault.trade(_path(), 0.1 ether, 1, "stranger");
    }

    function test_ownerFreezesAndWithdraws() public {
        vm.prank(owner);
        vault.setAgent(address(0));
        vm.prank(agent);
        vm.expectRevert(bytes("agent"));
        vault.trade(_path(), 0.1 ether, 1, "frozen");
        vm.prank(agent);
        vm.expectRevert(bytes("owner"));
        vault.withdraw(WETH, agent, 1 ether);
        vm.prank(owner);
        vault.withdraw(WETH, owner, 3 ether);
        eq(IERC20Min(WETH).balanceOf(owner), 3 ether, "owner withdrew everything");
    }
}
