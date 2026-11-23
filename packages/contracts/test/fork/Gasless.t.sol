// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelGasless} from "../../src/CorbelGasless.sol";
import {IERC20Min, IV2Router, IWETH} from "../../src/interfaces/External.sol";

interface IUSDGPermit {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function nonces(address) external view returns (uint256);
}

contract GaslessForkTest is Base {
    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    bytes32 constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    CorbelGasless g;
    uint256 constant PK = 0xA11CE;
    address owner;
    address relayer = address(0x7E1A);

    function setUp() public {
        g = new CorbelGasless(ROUTER);
        owner = vm.addr(PK);
        // the owner gets 100 USDG and no ETH at all
        address funder = address(0xF00D);
        vm.deal(funder, 1 ether);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        vm.startPrank(funder);
        IWETH(WETH).deposit{value: 0.2 ether}();
        IERC20Min(WETH).approve(address(ROUTER), 0.2 ether);
        ROUTER.swapExactTokensForTokens(0.2 ether, 100e6, p, owner, block.timestamp + 60);
        vm.stopPrank();
        vm.deal(owner, 0);
    }

    function _path() internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = USDG;
        p[1] = WETH;
    }

    function _signed(uint256 nonce) internal view returns (CorbelGasless.Intent memory it, uint8 v, bytes32 r, bytes32 s, uint8 pv, bytes32 pr, bytes32 ps) {
        it = CorbelGasless.Intent(owner, USDG, 50e6, keccak256(abi.encodePacked(_path())), 1, 1e6, block.timestamp + 300, nonce);
        (v, r, s) = vm.sign(PK, g.digest(it));
        bytes32 pd = keccak256(abi.encodePacked("\x19\x01", IUSDGPermit(USDG).DOMAIN_SEPARATOR(), keccak256(abi.encode(PERMIT_TYPEHASH, owner, address(g), it.amountIn, IUSDGPermit(USDG).nonces(owner), it.deadline))));
        (pv, pr, ps) = vm.sign(PK, pd);
    }

    function test_ownerWithNoEthSwapsAndTheRelayerIsPaidInTheToken() public {
        (CorbelGasless.Intent memory it, uint8 v, bytes32 r, bytes32 s, uint8 pv, bytes32 pr, bytes32 ps) = _signed(1);
        uint256 w0 = IERC20Min(WETH).balanceOf(owner);
        vm.prank(relayer);
        uint256 out = g.swap(it, _path(), v, r, s, pv, pr, ps);
        ok(out > 0, "owner got WETH");
        eq(IERC20Min(WETH).balanceOf(owner) - w0, out, "output to the owner");
        eq(IERC20Min(USDG).balanceOf(relayer), 1e6, "relayer paid 1 USDG");
        eq(owner.balance, 0, "the owner never needed ETH");
        eq(IERC20Min(USDG).balanceOf(address(g)), 0, "nothing kept");
        vm.prank(relayer);
        vm.expectRevert(bytes("nonce used"));
        g.swap(it, _path(), v, r, s, pv, pr, ps);
    }

    function test_aRelayerCannotChangeThePath() public {
        (CorbelGasless.Intent memory it, uint8 v, bytes32 r, bytes32 s, uint8 pv, bytes32 pr, bytes32 ps) = _signed(2);
        address[] memory other = new address[](3);
        other[0] = USDG;
        other[1] = address(0xBEEF);
        other[2] = WETH;
        vm.prank(relayer);
        vm.expectRevert(bytes("path"));
        g.swap(it, other, v, r, s, pv, pr, ps);
    }
}
