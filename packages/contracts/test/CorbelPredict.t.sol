// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base, MockToken} from "./Base.sol";
import {CorbelPredict} from "../src/CorbelPredict.sol";

/// A V2 pair whose reserves the test sets directly. Cumulative prices accrue the way Uniswap V2's do.
contract MockPair {
    address public token0;
    address public token1;
    uint112 r0;
    uint112 r1;
    uint32 ts;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    constructor(address a, address b) {
        token0 = a;
        token1 = b;
    }

    function set(uint112 a, uint112 b) external {
        uint32 nowTs = uint32(block.timestamp);
        unchecked {
            if (ts != 0 && nowTs != ts && r0 > 0 && r1 > 0) {
                price0CumulativeLast += ((uint256(r1) << 112) / r0) * (nowTs - ts);
                price1CumulativeLast += ((uint256(r0) << 112) / r1) * (nowTs - ts);
            }
        }
        r0 = a;
        r1 = b;
        ts = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (r0, r1, ts);
    }
}

contract MockFactory {
    mapping(address => mapping(address => address)) public getPair;

    function add(address a, address b, address p) external {
        getPair[a][b] = p;
        getPair[b][a] = p;
    }
}

contract CorbelPredictTest is Base {
    MockToken usdg;
    MockToken meme;
    MockPair pair;
    CorbelPredict p;
    address fund = address(0xF00D);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address carol = address(0xC0);
    uint64 t0 = 1_800_000_000;

    function setUp() public {
        vm.warp(t0);
        usdg = new MockToken(6);
        meme = new MockToken(18);
        pair = new MockPair(address(meme), address(usdg));
        pair.set(1_000_000e18, 50_000e6);
        MockFactory f = new MockFactory();
        f.add(address(meme), address(usdg), address(pair));
        p = new CorbelPredict(address(usdg), address(f), fund);
        address[3] memory us = [alice, bob, carol];
        for (uint256 i = 0; i < 3; i++) {
            usdg.mint(us[i], 1_000_000e6);
            vm.prank(us[i]);
            usdg.approve(address(p), type(uint256).max);
        }
    }

    function _survival() internal returns (uint256) {
        return p.createSurvival(address(pair), address(usdg), 10_000e6, t0 + 1 days, t0 + 8 days);
    }

    /// three public checks, hours apart, during the watch window
    function _pokes(uint256 id) internal {
        for (uint256 i = 0; i < 3; i++) {
            vm.warp(t0 + 2 days + i * 1 days);
            p.poke(id);
        }
    }

    function test_survivalYesWhenLiquidityStays() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.prank(bob);
        p.bet(id, false, 1_000e6);
        _pokes(id);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        CorbelPredict.Market memory m = p.markets(id);
        eq(uint256(m.state), uint256(CorbelPredict.State.Settled), "settled");
        ok(m.outcome, "yes");
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        p.claim(id);
        // stake back + bob's 1,000 minus 1% fee
        eq(usdg.balanceOf(alice) - before, 1_990e6, "alice payout");
        eq(usdg.balanceOf(fund), 10e6, "fee to fund");
        eq(p.claimable(id, bob), 0, "loser gets nothing");
    }

    function test_survivalPullAtOnePokeIsNo() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.prank(bob);
        p.bet(id, false, 1_000e6);
        _pokes(id);
        pair.set(1_000e18, 5e6); // liquidity pulled
        vm.warp(t0 + 6 days);
        p.poke(id);
        pair.set(1_000_000e18, 50_000e6); // and parked back before expiry
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        ok(!p.markets(id).outcome, "the lowest reserve decides: NO");
    }

    function test_parkingLiquidityAtTheEndDoesNotBuyYes() public {
        pair.set(1_000e18, 5e6);
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.prank(bob);
        p.bet(id, false, 1_000e6);
        _pokes(id); // low at every check
        pair.set(1_000_000e18, 50_000e6);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        eq(uint256(p.markets(id).state), uint256(CorbelPredict.State.Settled), "settled");
        ok(!p.markets(id).outcome, "still NO");
    }

    function test_earlierStakeWeighsMore() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6); // at creation: +50%
        vm.warp(t0 + 1 days - 1);
        vm.prank(carol);
        p.bet(id, true, 1_000e6); // a second before close: ~+0%
        vm.prank(bob);
        p.bet(id, false, 3_000e6);
        _pokes(id);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        gte(p.claimable(id, alice), p.claimable(id, carol) + 500e6, "early stake earns more of the prize");
        // the whole pot is paid out, minus the fee and rounding dust
        uint256 paid = p.claimable(id, alice) + p.claimable(id, carol);
        lte(paid, 5_000e6 - 30e6, "never more than the pot");
        gte(paid, 5_000e6 - 30e6 - 2, "dust at most");
    }

    function test_oneSidedMarketRefunds() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        eq(uint256(p.markets(id).state), uint256(CorbelPredict.State.Void), "void");
        eq(p.claimable(id, alice), 1_000e6, "full refund");
    }

    function test_noBetsAfterCloseAndNoDoubleClaim() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.prank(bob);
        p.bet(id, false, 1_000e6);
        vm.warp(t0 + 1 days);
        vm.expectRevert(bytes("closed"));
        vm.prank(carol);
        p.bet(id, true, 1e6);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        vm.prank(alice);
        p.claim(id);
        vm.expectRevert(bytes("nothing"));
        vm.prank(alice);
        p.claim(id);
    }

    /// meme in USDG, raw units, UQ112x112: 50,000 USDG over 1,000,000 meme
    function _px() internal pure returns (uint256) {
        return (uint256(50_000e6) << 112) / 1_000_000e18;
    }

    /// bets close at +2d, the TWAP window is the last hour before expiry at +3d
    function _price(uint256 strike) internal returns (uint256 id) {
        id = p.createPrice(address(pair), address(usdg), strike, 1 hours, keccak256("meme at or above the strike"), t0 + 2 days, t0 + 3 days);
        vm.prank(alice);
        p.bet(id, true, 500e6);
        vm.prank(bob);
        p.bet(id, false, 500e6);
    }

    function _runWindow(uint256 id) internal {
        vm.warp(t0 + 3 days - 1 hours);
        p.startTwap(id);
        vm.warp(t0 + 3 days);
    }

    /// Price markets settle from the pool's own TWAP: nobody proposes, nobody rules.
    function test_priceMarketSettlesFromTheTwap() public {
        uint256 id = _price((_px() * 9) / 10);
        _runWindow(id);
        p.settlePrice(id);
        ok(p.markets(id).outcome, "above the strike: YES");
        gte(p.claimable(id, alice), 990e6, "alice wins");
    }

    function test_priceBelowTheStrikeIsNo() public {
        uint256 id = _price((_px() * 11) / 10);
        _runWindow(id);
        p.settlePrice(id);
        ok(!p.markets(id).outcome, "below the strike: NO");
        gte(p.claimable(id, bob), 990e6, "bob wins");
    }

    /// A spike in the last seconds of the window moves the average by little.
    function test_lastSecondSpikeDoesNotBuyYes() public {
        uint256 id = _price((_px() * 12) / 10);
        vm.warp(t0 + 3 days - 1 hours);
        p.startTwap(id);
        vm.warp(t0 + 3 days - 10);
        pair.set(1_000_000e18, 500_000e6); // price x10 for the last 10 seconds
        vm.warp(t0 + 3 days);
        p.settlePrice(id);
        ok(!p.markets(id).outcome, "the average stays under the strike");
    }

    function test_missedStartRefunds() public {
        uint256 id = _price(1);
        vm.warp(t0 + 3 days);
        p.settlePrice(id);
        eq(uint256(p.markets(id).state), uint256(CorbelPredict.State.Void), "void");
        eq(p.claimable(id, bob), 500e6, "refund");
    }

    function test_startOnlyInsideTheWindow() public {
        uint256 id = _price(1);
        vm.warp(t0 + 3 days - 2 hours);
        vm.expectRevert(bytes("window"));
        p.startTwap(id);
        vm.warp(t0 + 3 days - 20 minutes);
        vm.expectRevert(bytes("window"));
        p.startTwap(id);
    }

    function test_lateSettlementRefunds() public {
        uint256 id = _price(1);
        vm.warp(t0 + 3 days - 1 hours);
        p.startTwap(id);
        vm.warp(t0 + 3 days + 31 minutes);
        p.settlePrice(id);
        eq(uint256(p.markets(id).state), uint256(CorbelPredict.State.Void), "void");
    }

    function test_stalledMarketRefunds() public {
        uint256 id = _price(1);
        vm.prank(bob);
        p.bet(id, false, 200e6);
        vm.warp(t0 + 3 days + 15 days);
        p.voidStalled(id);
        eq(p.claimable(id, bob), 700e6, "refund");
    }

    /// The betting closes before the averaging window opens, and the window has bounds.
    function test_priceMarketTimesAndWindow() public {
        vm.expectRevert(bytes("times"));
        p.createPrice(address(pair), address(usdg), 1, 1 hours, bytes32(0), t0 + 2 days, t0 + 2 days + 30 minutes);
        vm.expectRevert(bytes("window"));
        p.createPrice(address(pair), address(usdg), 1, 5 minutes, bytes32(0), t0 + 2 days, t0 + 3 days);
        MockPair fake = new MockPair(address(meme), address(usdg));
        vm.expectRevert(bytes("not a factory pair"));
        p.createPrice(address(fake), address(usdg), 1, 1 hours, bytes32(0), t0 + 2 days, t0 + 3 days);
    }

    /// Any stakes, any timing, either outcome: every claim together never exceeds what the contract holds.
    function testFuzz_solvent(uint96 a, uint96 b, uint96 c, uint32 ta, uint32 tc, bool yesWins) public {
        uint256 A = uint256(a) % 100_000e6 + 1;
        uint256 B = uint256(b) % 100_000e6 + 1;
        uint256 Cc = uint256(c) % 100_000e6 + 1;
        uint256 id = _survival();
        vm.warp(t0 + (uint256(ta) % 1 days));
        vm.prank(alice);
        p.bet(id, true, A);
        vm.warp(t0 + (uint256(tc) % 1 days));
        vm.prank(carol);
        p.bet(id, true, Cc);
        vm.prank(bob);
        p.bet(id, false, B);
        if (!yesWins) pair.set(1, 1);
        _pokes(id);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        uint256 owed = p.claimable(id, alice) + p.claimable(id, bob) + p.claimable(id, carol);
        lte(owed, usdg.balanceOf(address(p)), "solvent");
        address[3] memory us = [alice, bob, carol];
        for (uint256 i = 0; i < 3; i++) {
            if (p.claimable(id, us[i]) > 0) {
                vm.prank(us[i]);
                p.claim(id);
            }
        }
    }

    // ---------------------------------------------------------------- audit findings, as tests

    /// A-1: a contract pretending to be a pair cannot open a market.
    function test_fakePairRefused() public {
        MockPair fake = new MockPair(address(meme), address(usdg));
        vm.expectRevert(bytes("not a factory pair"));
        p.createSurvival(address(fake), address(usdg), 1, t0 + 1 days, t0 + 2 days);
    }

    /// A-2: reserves moved in the same block (a flash add or pull) are not read.
    function test_sameBlockReservesRefused() public {
        uint256 id = _survival();
        vm.warp(t0 + 2 days);
        pair.set(1, 1);
        vm.expectRevert(bytes("reserves moved this block"));
        p.poke(id);
    }

    /// A-3: without enough public checks, nobody wins by one read at settlement: stakes are refunded.
    function test_tooFewChecksRefunds() public {
        uint256 id = _survival();
        vm.prank(alice);
        p.bet(id, true, 1_000e6);
        vm.prank(bob);
        p.bet(id, false, 1_000e6);
        vm.warp(t0 + 2 days);
        p.poke(id);
        vm.warp(t0 + 9 days);
        p.settleSurvival(id);
        eq(uint256(p.markets(id).state), uint256(CorbelPredict.State.Void), "void");
        eq(p.claimable(id, bob), 1_000e6, "refund");
    }

    /// A-4: many pokes within an hour count once.
    function test_pokeSpamCountsOnce() public {
        uint256 id = _survival();
        vm.warp(t0 + 2 days);
        for (uint256 i = 0; i < 5; i++) {
            p.poke(id);
            vm.warp(block.timestamp + 10 minutes);
        }
        eq(p.markets(id).pokes, 1, "one per hour");
    }
}
