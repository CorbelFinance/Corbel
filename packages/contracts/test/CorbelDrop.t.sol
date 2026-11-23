// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base, MockToken} from "./Base.sol";
import {CorbelDrop} from "../src/CorbelDrop.sol";

contract CorbelDropTest is Base {
    MockToken t;
    CorbelDrop drop;
    address safe = address(0x5AFE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function _leaf(address w, uint256 a) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(w, a))));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setUp() public {
        t = new MockToken(18);
        drop = new CorbelDrop(address(t), safe, 14 days); // owner, 2026-11-23: 14 days to claim
        t.mint(address(drop), 5_000_000e18); // the season's whole budget, visible before it starts
    }

    // three wallets: alice 3M, bob 1.5M, carol 0.5M; tree: ((alice, bob), carol)
    function _post() internal returns (bytes32 la, bytes32 lb, bytes32 lc) {
        la = _leaf(alice, 3_000_000e18);
        lb = _leaf(bob, 1_500_000e18);
        lc = _leaf(carol, 500_000e18);
        bytes32 root = _pair(_pair(la, lb), lc);
        vm.prank(safe);
        drop.post(1, root, 5_000_000e18);
    }

    function test_eachClaimsOnlyTheirOwnAmountOnce() public {
        (bytes32 la, bytes32 lb, bytes32 lc) = _post();
        bytes32[] memory p = new bytes32[](2);
        p[0] = lb;
        p[1] = lc;
        drop.claim(1, alice, 3_000_000e18, p);
        eq(t.balanceOf(alice), 3_000_000e18, "alice paid");
        vm.expectRevert(bytes("claimed"));
        drop.claim(1, alice, 3_000_000e18, p);
        bytes32[] memory q = new bytes32[](1);
        q[0] = _pair(la, lb);
        vm.expectRevert(bytes("proof"));
        drop.claim(1, carol, 900_000e18, q); // more than carol was given
        drop.claim(1, carol, 500_000e18, q);
        eq(t.balanceOf(carol), 500_000e18, "carol paid");
    }

    function test_onlyTheSafePostsAndOnlyFundedRounds() public {
        vm.expectRevert(bytes("setter"));
        drop.post(1, bytes32(uint256(1)), 1);
        vm.prank(safe);
        vm.expectRevert(bytes("not funded"));
        drop.post(1, bytes32(uint256(1)), 6_000_000e18);
    }

    function test_unclaimedIsBurnedNeverReturned() public {
        (, bytes32 lb, bytes32 lc) = _post();
        bytes32[] memory p = new bytes32[](2);
        p[0] = lb;
        p[1] = lc;
        drop.claim(1, alice, 3_000_000e18, p);
        vm.expectRevert(bytes("open"));
        drop.burnUnclaimed(1);
        vm.warp(block.timestamp + 15 days);
        vm.expectRevert(bytes("closed"));
        drop.claim(1, alice, 3_000_000e18, p);
        drop.burnUnclaimed(1);
        eq(t.balanceOf(DEAD), 2_000_000e18, "bob and carol's unclaimed coins burned");
        eq(t.balanceOf(address(drop)), 0, "nothing left for anyone to take");
    }

    // a stranger who sends the claim, or swaps in their own address with the winner's proof, gets nothing
    function test_strangerCannotRedirectAWinnersCoins() public {
        (, bytes32 lb, bytes32 lc) = _post();
        address eve = address(0xE7E);
        bytes32[] memory p = new bytes32[](2);
        p[0] = lb;
        p[1] = lc;
        vm.prank(eve);
        vm.expectRevert(bytes("proof"));
        drop.claim(1, eve, 3_000_000e18, p); // alice's proof with eve's address: rejected
        vm.prank(eve);
        drop.claim(1, alice, 3_000_000e18, p); // eve sends alice's claim: the coins still go to alice
        eq(t.balanceOf(alice), 3_000_000e18, "alice paid");
        eq(t.balanceOf(eve), 0, "eve got nothing");
        vm.prank(eve);
        vm.expectRevert(bytes("claimed"));
        drop.claim(1, alice, 3_000_000e18, p);
    }
}
