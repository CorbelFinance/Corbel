// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelMandate, CorbelMandates} from "../../src/CorbelMandate.sol";
import {IERC20Min, IPoolManager, IV2Router, IWETH, PoolKey} from "../../src/interfaces/External.sol";

contract MandateForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC; // "NVIDIA • Robinhood Token" (issuer not verified)
    address constant PEPE = 0x0ad3B612c5988E4257a0AAB6f2713a3a5371D111;

    address owner = address(0x0A11CE);
    address agent = address(0xA6E47);
    CorbelMandates factory;
    CorbelMandate m;

    function _usdg(address who, uint256 ethIn) internal {
        vm.deal(who, ethIn);
        vm.startPrank(who);
        IWETH(WETH).deposit{value: ethIn}();
        IERC20Min(WETH).approve(address(ROUTER), ethIn);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        ROUTER.swapExactTokensForTokens(ethIn, 1, p, who, block.timestamp);
        vm.stopPrank();
    }

    /// Next Wednesday 12:00 UTC (inside the window, a weekday).
    function _wednesdayNoon() internal {
        uint256 t = block.timestamp - (block.timestamp % 1 days) + 12 hours + 1 days;
        while ((t / 1 days + 4) % 7 != 3) t += 1 days;
        vm.warp(t);
    }

    function setUp() public {
        factory = new CorbelMandates(ROUTER, PM, USDG);
        CorbelMandate.Rules memory r = CorbelMandate.Rules({
            maxSlippageBps: 100,
            hourFrom: 0,
            hourTo: 0,
            weekdaysOnly: true,
            cooldown: 0,
            minBond: 100e6,
            slashBps: 1_000,
            strikesToFreeze: 3
        });
        vm.prank(owner);
        m = factory.create(agent, r);
        vm.startPrank(owner);
        m.setLimit(USDG, true, 1_000e6, 2_000e6);
        m.setLimit(WETH, true, 0.5 ether, 1 ether);
        m.setLimit(NVDA, true, 100e18, 200e18);
        m.setLimit(address(0), true, 0.05 ether, 0.1 ether);
        m.setLimit(PEPE, true, type(uint128).max, type(uint128).max);
        vm.stopPrank();

        _usdg(owner, 3 ether); // the owner's trading money
        uint256 ub = IERC20Min(USDG).balanceOf(owner);
        vm.prank(owner);
        IERC20Min(USDG).transfer(address(m), ub);
        _usdg(agent, 0.5 ether); // the agent's bond money
        uint256 ab = IERC20Min(USDG).balanceOf(agent);
        vm.startPrank(agent);
        IERC20Min(USDG).approve(address(m), ab);
        m.postBond(500e6);
        vm.stopPrank();
        vm.prank(owner);
        m.approveV2Pool(WETH, USDG); // after the setup swaps: the owner marks the pool as it is
        _wednesdayNoon();
    }

    function _nvdaKey() internal pure returns (PoolKey memory) {
        // any NVDA/USDG key: the size rule stops the trade before the pool is touched
        return PoolKey(USDG, NVDA, 992_500, 9_925, address(0));
    }

    function test_agentBuyingNvdaFor9000IsStoppedAndPaysTheOwner() public {
        uint256 vaultBefore = IERC20Min(USDG).balanceOf(address(m));
        uint256 ownerBefore = IERC20Min(USDG).balanceOf(owner);
        eq(uint256(m.check(USDG, NVDA, 9_000e6)), uint256(CorbelMandate.Rule.Size), "check says SIZE");

        vm.prank(agent);
        (bool traded,) = m.tradeV4(_nvdaKey(), USDG, 9_000e6, "buy NVDA $9,000");
        ok(!traded, "no trade");
        eq(IERC20Min(USDG).balanceOf(owner) - ownerBefore, 50e6, "10% of the 500 bond to the owner");
        eq(m.bond(), 450e6, "bond after the slash");
        eq(m.strikes(), 1, "one strike");
        // the vault paid nothing: owner's money untouched, only the bond moved
        eq(IERC20Min(USDG).balanceOf(address(m)) - m.bond(), vaultBefore - 500e6, "owner funds untouched");
    }

    function test_weekendWindowIsARule() public {
        vm.warp(block.timestamp + 3 days); // Wednesday -> Saturday
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        vm.prank(agent);
        (bool traded,) = m.tradeV2(p, 0.1 ether, 1, "weekend try");
        ok(!traded, "stopped on Saturday");
        eq(uint256(m.check(WETH, USDG, 0.1 ether)), uint256(CorbelMandate.Rule.Window), "window");
    }

    function test_threeStrikesFreezeAndSeizeTheRest() public {
        uint256 ownerBefore = IERC20Min(USDG).balanceOf(owner);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(agent);
            m.tradeV4(_nvdaKey(), USDG, 9_000e6, "again");
        }
        ok(m.frozen(), "frozen");
        eq(m.bond(), 0, "bond gone");
        eq(IERC20Min(USDG).balanceOf(owner) - ownerBefore, 500e6, "whole bond to the owner");
        vm.prank(agent);
        vm.expectRevert(bytes("frozen"));
        m.tradeV4(_nvdaKey(), USDG, 1e6, "after freeze");
    }

    function test_v2TradeWithinTheMandate() public {
        vm.deal(owner, 1 ether);
        vm.startPrank(owner);
        IWETH(WETH).deposit{value: 1 ether}();
        IERC20Min(WETH).transfer(address(m), 1 ether);
        vm.stopPrank();
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        uint256 q = ROUTER.getAmountsOut(0.2 ether, p)[1];
        uint256 before = IERC20Min(USDG).balanceOf(address(m));
        vm.prank(agent);
        (bool traded, uint256 out) = m.tradeV2(p, 0.2 ether, (q * 9_950) / 10_000, "rebalance");
        ok(traded, "traded");
        eq(IERC20Min(USDG).balanceOf(address(m)) - before, out, "output stays in the vault");
        eq(m.strikes(), 0, "no strike");
    }

    function _fundWeth() internal {
        vm.deal(owner, 1 ether);
        vm.startPrank(owner);
        IWETH(WETH).deposit{value: 1 ether}();
        IERC20Min(WETH).transfer(address(m), 1 ether);
        vm.stopPrank();
    }

    function test_totalBudgetStopsTheTradeThatWouldPassIt() public {
        _fundWeth();
        vm.prank(owner);
        m.setTotal(WETH, 0.3 ether);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        uint256 q = ROUTER.getAmountsOut(0.2 ether, p)[1];
        vm.prank(agent);
        (bool first,) = m.tradeV2(p, 0.2 ether, (q * 9_950) / 10_000, "first");
        ok(first, "within the total");
        eq(m.spentTotal(WETH), 0.2 ether, "spent counted");
        eq(uint256(m.check(WETH, USDG, 0.2 ether)), uint256(CorbelMandate.Rule.Budget), "the next one passes the total");
        vm.warp(block.timestamp + 1 days); // a new day does not refill a total
        eq(uint256(m.check(WETH, USDG, 0.2 ether)), uint256(CorbelMandate.Rule.Budget), "still over the total");
    }

    function test_endDateClosesTheMandateAndIsCappedAtNinetyDays() public {
        vm.startPrank(owner);
        vm.expectRevert(bytes("term"));
        m.setEnd(block.timestamp + 91 days);
        m.setEnd(block.timestamp + 2 days);
        vm.stopPrank();
        eq(uint256(m.check(WETH, USDG, 0.1 ether)), uint256(CorbelMandate.Rule.None), "open before the end");
        vm.warp(block.timestamp + 2 days);
        eq(uint256(m.check(WETH, USDG, 0.1 ether)), uint256(CorbelMandate.Rule.Window), "closed at the end");
    }

    function _signScore(uint256 pk, address token, uint8 score, uint64 at) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", m.SCORE_DOMAIN(), keccak256(abi.encode(m.SCORE_TYPEHASH(), token, score, at))));
        (v, r, s) = vm.sign(pk, digest);
    }

    function test_scoreRuleNeedsAFreshSignedScoreAtTheLine() public {
        uint256 pk = 0xC0B;
        address scorer = vm.addr(pk);
        vm.prank(owner);
        m.setScoreRule(scorer, 70);
        eq(uint256(m.check(USDG, NVDA, 100e6)), uint256(CorbelMandate.Rule.Score), "no score: refused");
        eq(uint256(m.check(NVDA, USDG, 1e18)), uint256(CorbelMandate.Rule.None), "selling into USDG needs no score");

        (uint8 v, bytes32 r, bytes32 s) = _signScore(pk, NVDA, 80, uint64(block.timestamp));
        m.submitScore(NVDA, 80, uint64(block.timestamp), v, r, s);
        eq(uint256(m.check(USDG, NVDA, 100e6)), uint256(CorbelMandate.Rule.None), "fresh 80 at line 70: allowed");

        vm.warp(block.timestamp + 11 minutes);
        eq(uint256(m.check(USDG, NVDA, 100e6)), uint256(CorbelMandate.Rule.Score), "older than 10 minutes: refused");

        (v, r, s) = _signScore(pk, NVDA, 60, uint64(block.timestamp));
        m.submitScore(NVDA, 60, uint64(block.timestamp), v, r, s);
        eq(uint256(m.check(USDG, NVDA, 100e6)), uint256(CorbelMandate.Rule.Score), "fresh 60 under the line: refused");

        (v, r, s) = _signScore(0xBAD, NVDA, 99, uint64(block.timestamp));
        vm.expectRevert(bytes("signer"));
        m.submitScore(NVDA, 99, uint64(block.timestamp), v, r, s);
    }

    function test_priceRuleSlashesALooseMinOut() public {
        vm.deal(owner, 1 ether);
        vm.startPrank(owner);
        IWETH(WETH).deposit{value: 1 ether}();
        IERC20Min(WETH).transfer(address(m), 1 ether);
        vm.stopPrank();
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        vm.prank(agent);
        (bool traded,) = m.tradeV2(p, 0.2 ether, 1, "accepts any price");
        ok(!traded, "stopped");
        eq(m.strikes(), 1, "strike");
        eq(m.bond(), 450e6, "slashed");
        eq(m.spentOnDay(WETH, block.timestamp / 1 days), 0, "budget not consumed by a refused trade");
        eq(m.spentTotal(WETH), 0, "lifetime cap not consumed by a refused trade either");
    }

    function test_poolFeeAboveOnePercentIsAViolation() public {
        // the PEPE pool charges 1.5%: over the mandate's 1% pool-fee ceiling, refused and slashed
        vm.deal(address(m), 1 ether);
        PoolKey memory k = PoolKey(address(0), PEPE, 15_000, 200, address(0));
        uint256 ethBefore = address(m).balance;
        vm.prank(agent);
        (bool traded,) = m.tradeV4(k, address(0), 0.01 ether, "PEPE at 1.5% fee");
        ok(!traded, "refused");
        eq(address(m).balance, ethBefore, "no ETH spent");
        eq(m.strikes(), 1, "strike");
    }

    function test_v4TradeOnALivePool() public {
        address tok = 0xfBd2f3180FFE339C4d30D47D4f35a81773499CcE;
        vm.prank(owner);
        m.setLimit(tok, true, type(uint128).max, type(uint128).max);
        vm.deal(address(m), 1 ether);
        PoolKey memory k = PoolKey(address(0), tok, 10_000, 200, address(0));
        vm.prank(owner);
        m.approveV4Pool(k);
        vm.prank(agent);
        (bool traded, uint256 out) = m.tradeV4(k, address(0), 0.001 ether, "small buy on a live pool");
        ok(traded, "traded");
        ok(out > 0, "filled within the price cap");
        eq(IERC20Min(tok).balanceOf(address(m)), out, "tokens in the vault");
    }

    function test_bondIsNotTheOwnersAndUnbondWaits() public {
        uint256 free = IERC20Min(USDG).balanceOf(address(m)) - m.bond();
        vm.prank(owner);
        vm.expectRevert(bytes("bond is not the owner's"));
        m.withdraw(USDG, owner, free + 1);
        vm.prank(owner);
        m.withdraw(USDG, owner, free);

        vm.prank(agent);
        m.requestUnbond(200e6);
        vm.prank(agent);
        vm.expectRevert(bytes("not ready"));
        m.withdrawUnbonded();
        vm.warp(block.timestamp + 1 days);
        uint256 before = IERC20Min(USDG).balanceOf(agent);
        vm.prank(agent);
        m.withdrawUnbonded();
        eq(IERC20Min(USDG).balanceOf(agent) - before, 200e6, "unbonded after the delay");
    }

    function test_trapPoolWithA99PercentFeeIsAViolation() public {
        // NVDA/USDG pools on this chain charge up to 99.25% per swap: within size, still refused and slashed
        vm.prank(agent);
        (bool traded,) = m.tradeV4(_nvdaKey(), USDG, 100e6, "small NVDA buy, trap pool");
        ok(!traded, "refused");
        eq(m.strikes(), 1, "strike");
        eq(m.bond(), 450e6, "slashed");
    }

    function test_strangersCannotTrade() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("agent"));
        m.tradeV4(_nvdaKey(), USDG, 1e6, "stranger");
    }
}
