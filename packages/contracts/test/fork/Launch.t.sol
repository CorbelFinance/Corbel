// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelLaunchpad, CorbelSale, CorbelToken} from "../../src/CorbelLaunch.sol";
import {IPoolManager, PoolKey, SwapParams} from "../../src/interfaces/External.sol";

/// Buys a launched token on its v4 pool with native ETH, the way any wallet would after graduation.
contract V4Buyer {
    IPoolManager immutable pm;
    PoolKey key;
    uint256 amount;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    receive() external payable {}

    function buy(PoolKey memory k) external payable returns (uint256 got) {
        key = k;
        amount = msg.value;
        uint256 before = CorbelToken(k.currency1).balanceOf(address(this));
        pm.unlock("");
        got = CorbelToken(k.currency1).balanceOf(address(this)) - before;
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        int256 d = pm.swap(key, SwapParams(true, -int256(amount), 4295128740), "");
        pm.settle{value: uint256(uint128(-int128(d >> 128)))}();
        pm.take(key.currency1, address(this), uint256(uint128(int128(d))));
        return "";
    }
}

contract LaunchForkTest is Base {
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant FEE_TO = address(0xFEE0);
    address creator = address(0xC0FFEE);
    address alice = address(0xA11CE1);
    address bob = address(0xB0B0B1);

    CorbelLaunchpad pad;
    CorbelSale sale;
    CorbelToken token;

    function setUp() public {
        pad = new CorbelLaunchpad(PM, FEE_TO);
        vm.prank(creator);
        sale = pad.launch("Corbel Test", "CTEST", 4 ether, 1 days);
        token = sale.token();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _slot0(PoolKey memory k) internal view returns (uint160 sqrtP, uint128 liq) {
        bytes32 id = keccak256(abi.encode(k));
        bytes32 st = keccak256(abi.encode(id, uint256(6)));
        sqrtP = uint160(uint256(PM.extsload(st)));
        liq = uint128(uint256(PM.extsload(bytes32(uint256(st) + 3))));
    }

    function test_buyAndSellOnTheCurve() public {
        vm.prank(alice);
        uint256 got = sale.buy{value: 0.5 ether}(0);
        ok(got > 0, "tokens out");
        eq(FEE_TO.balance, 0.005 ether, "1% buy fee");
        eq(address(sale).balance, sale.raised(), "curve holds exactly what it raised");

        vm.startPrank(alice);
        token.approve(address(sale), got);
        (uint256 quoted,) = sale.quoteSell(got / 2);
        uint256 out = sale.sell(got / 2, quoted);
        vm.stopPrank();
        eq(out, quoted, "sell pays the quote");
        eq(address(sale).balance, sale.raised(), "still fully backed");
    }

    function test_transfersLockedUntilGraduation() public {
        vm.prank(alice);
        uint256 got = sale.buy{value: 0.2 ether}(0);
        vm.prank(alice);
        vm.expectRevert(bytes("locked until graduation"));
        token.transfer(bob, got);
    }

    function test_failedSaleRefundsWithoutFee() public {
        vm.prank(alice);
        uint256 got = sale.buy{value: 1 ether}(0);
        vm.warp(block.timestamp + 1 days + 1);
        eq(uint256(sale.state()), 1, "failed");
        vm.prank(bob);
        vm.expectRevert(bytes("not live"));
        sale.buy{value: 0.1 ether}(0);

        uint256 before = alice.balance;
        vm.startPrank(alice);
        token.approve(address(sale), got);
        sale.sell(got, 0);
        vm.stopPrank();
        uint256 back = alice.balance - before;
        // everything but the 1% buy fee comes back (rounding in the curve's favour, a few wei at most)
        near(back, 0.99 ether, 1, "refund");
        lte(back, 0.99 ether, "never more than paid in");
    }

    function test_graduationLocksLiquidityInV4() public {
        uint256 before = alice.balance;
        vm.prank(alice);
        sale.buy{value: 10 ether}(0); // more than needed: the excess comes back
        ok(sale.graduated(), "graduated");
        lte(before - alice.balance, 4.05 ether, "only the target plus fee was taken");
        eq(sale.sold(), sale.CURVE(), "curve sold out");

        PoolKey memory k = sale.poolKey();
        (uint160 sqrtP, uint128 liq) = _slot0(k);
        eq(sqrtP, sale.targetSqrtPrice(), "pool opens at the curve's last price");
        eq(liq, sale.lockedLiquidity(), "all liquidity is ours, full range");
        ok(liq > 0, "liquidity");
        eq(address(sale).balance, 0, "no ETH left in the sale");
        eq(token.balanceOf(address(sale)), 0, "no tokens left in the sale");
        ok(token.open(), "transfers open");

        // the token now trades on v4 like any other
        V4Buyer buyer = new V4Buyer(PM);
        vm.deal(address(buyer), 1 ether);
        uint256 bought = buyer.buy{value: 0.1 ether}(k);
        ok(bought > 0, "pool trades");

        vm.prank(alice);
        token.transfer(bob, 1e18);
        eq(token.balanceOf(bob), 1e18, "wallet transfers after graduation");
        vm.prank(alice);
        vm.expectRevert(bytes("graduated: trade on the pool"));
        sale.sell(1e18, 0);
    }

    /// Report 2026-11-20 (L1): an attacker opened the pool first and parked liquidity off the curve's price, so the
    /// sell-out buy reverted with "pool pre-seeded" and the sale ended in refunds. The gate now refuses both moves.
    function test_nobodyCanOpenOrSeedThePoolBeforeGraduation() public {
        PoolKey memory k = sale.poolKey();
        eq(k.hooks, address(pad.gate()), "pool key carries the gate");
        uint160 off = sale.targetSqrtPrice() / 2;
        vm.prank(bob);
        vm.expectRevert();
        PM.initialize(k, off);

        vm.prank(alice);
        sale.buy{value: 10 ether}(0);
        ok(sale.graduated(), "graduated");
        (uint160 sqrtP, uint128 liq) = _slot0(k);
        eq(sqrtP, sale.targetSqrtPrice(), "opened at the curve's price");
        ok(liq > 0, "liquidity locked");

        // after graduation the pool trades like any other
        V4Buyer b = new V4Buyer(PM);
        uint256 got = b.buy{value: 0.01 ether}(k);
        ok(got > 0, "bought on the pool");
    }
}
