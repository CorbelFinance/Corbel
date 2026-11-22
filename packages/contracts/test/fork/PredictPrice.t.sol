// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelPredict} from "../../src/CorbelPredict.sol";
import {IERC20Min, IV2Router, IWETH} from "../../src/interfaces/External.sol";

interface IPairCum {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
}

interface IFactoryMin {
    function getPair(address, address) external view returns (address);
}

/// A price market on the live WETH/USDG pair, settled from the pair's own cumulative price: no resolver.
contract PredictPriceForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant FUND = address(0xF00D);
    address alice = address(0xA11CE2);
    address bob = address(0xB0B0B2);

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

    function test_ethAboveHalfItsPriceSettlesYesFromTheTwap() public {
        address pair = IFactoryMin(ROUTER.factory()).getPair(WETH, USDG);
        (uint112 r0, uint112 r1,) = IPairCum(pair).getReserves();
        bool wethIs0 = IPairCum(pair).token0() == WETH;
        uint256 px = wethIs0 ? (uint256(r1) << 112) / r0 : (uint256(r0) << 112) / r1; // USDG per WETH, raw, UQ112x112
        CorbelPredict p = new CorbelPredict(USDG, ROUTER.factory(), FUND);
        uint64 t = uint64(block.timestamp);
        uint256 id = p.createPrice(pair, USDG, px / 2, 1 hours, keccak256("ETH at or above half of today's price"), t + 1 hours, t + 3 hours);

        _usdg(alice, 0.2 ether);
        _usdg(bob, 0.2 ether);
        vm.startPrank(alice);
        IERC20Min(USDG).approve(address(p), type(uint256).max);
        p.bet(id, true, 50e6);
        vm.stopPrank();
        vm.startPrank(bob);
        IERC20Min(USDG).approve(address(p), type(uint256).max);
        p.bet(id, false, 50e6);
        vm.stopPrank();

        vm.warp(t + 2 hours);
        p.startTwap(id);
        vm.warp(t + 3 hours);
        p.settlePrice(id);
        ok(p.markets(id).outcome, "YES from the pair's own TWAP");
        gte(p.claimable(id, alice), 99e6, "alice takes the pot");
    }
}
