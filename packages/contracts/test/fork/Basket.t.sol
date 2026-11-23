// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelBasket} from "../../src/CorbelBasket.sol";
import {IERC20Min, IV2Router, IWETH} from "../../src/interfaces/External.sol";

contract BasketForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant GME = 0x1b0E319c6A659F002271B69dB8A7df2F911c153E;
    CorbelBasket basket;
    address buyer = address(0xB0B);

    function setUp() public {
        basket = new CorbelBasket(ROUTER);
        vm.deal(buyer, 1 ether);
        vm.startPrank(buyer);
        IWETH(WETH).deposit{value: 1 ether}();
        IERC20Min(WETH).approve(address(basket), type(uint256).max);
        vm.stopPrank();
    }

    function _paths() internal pure returns (address[][] memory p) {
        p = new address[][](2);
        p[0] = new address[](2);
        p[0][0] = WETH;
        p[0][1] = USDG;
        p[1] = new address[](2);
        p[1][0] = WETH;
        p[1][1] = GME;
    }

    function test_buysTwoTokensByWeightIntoTheBuyer() public {
        uint16[] memory w = new uint16[](2);
        w[0] = 7_000;
        w[1] = 3_000;
        uint256[] memory mins = new uint256[](2);
        mins[0] = 1;
        mins[1] = 1;
        uint256 u0 = IERC20Min(USDG).balanceOf(buyer);
        uint256 g0 = IERC20Min(GME).balanceOf(buyer);
        vm.prank(buyer);
        uint256[] memory outs = basket.buy(WETH, 0.001 ether, _paths(), w, mins, block.timestamp + 60);
        eq(IERC20Min(USDG).balanceOf(buyer) - u0, outs[0], "USDG to the buyer");
        eq(IERC20Min(GME).balanceOf(buyer) - g0, outs[1], "GME to the buyer");
        ok(outs[0] > 0 && outs[1] > 0, "both bought");
        eq(IERC20Min(WETH).balanceOf(address(basket)), 0, "nothing kept");
        eq(IERC20Min(WETH).balanceOf(buyer), 1 ether - 0.001 ether, "spent exactly the input");
    }

    function test_weightsMustAddUpAndFloorsHold() public {
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 4_000;
        uint256[] memory mins = new uint256[](2);
        vm.prank(buyer);
        vm.expectRevert(bytes("weights"));
        basket.buy(WETH, 0.001 ether, _paths(), w, mins, block.timestamp + 60);
        w[1] = 5_000;
        mins[0] = type(uint256).max;
        vm.prank(buyer);
        vm.expectRevert();
        basket.buy(WETH, 0.001 ether, _paths(), w, mins, block.timestamp + 60);
    }
}
