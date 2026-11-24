// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {CorbelProofBurn, IFeeEscrow, ILaunchFees} from "../../src/CorbelProofBurn.sol";
import {IERC20Min, IPoolManager, PoolKey} from "../../src/interfaces/External.sol";

interface IEscrowCredit {
    function credit(address) external payable;
}

interface ILaunchFactory {
    function transferCreatorFeeRecipient(address token, address to) external;
    function setCreatorFeeRecipient(address token, address to) external;
}

/// Everything here is the real thing on a fork: the launchpad's hook, its fee escrow, its factory and the live pool.
contract ProofBurnForkTest is Base {
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IFeeEscrow constant ESCROW = IFeeEscrow(0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e);
    IEscrowCredit constant ESCROW_CREDIT = IEscrowCredit(address(ESCROW));
    address constant CORBEL = 0xAA1f4De6b9f7cDf11FB8AA97ce163D35D731CdB1;
    address constant FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    bytes32 constant PID = 0x3a59df3bd5870dee024ca508d8f89e46e3c47fdb024fc0d8f0c5cf3e5e6ef3a9;

    CorbelProofBurn b;
    address keeper = address(0x4EE9);
    address team = address(0x7EA3);
    address stranger = address(0x57A);
    address CREATOR;

    function setUp() public {
        PoolKey memory k = PoolKey(address(0), CORBEL, 0, 200, HOOK);
        b = new CorbelProofBurn(PM, ESCROW, ILaunchFees(FACTORY), CORBEL, k, team, keeper, 300);
        CREATOR = recipient(); // whoever the launch record names today
        vm.prank(CREATOR);
        ILaunchFactory(FACTORY).transferCreatorFeeRecipient(CORBEL, address(b)); // the launchpad's own function
    }

    /// The fee step itself. The launchpad's sweeper runs only when its own conditions are met (amount, time, price), which
    /// a fork cannot stage, so this makes the one call it ends with: the hook credits whoever its own launch record names.
    function _fees() internal returns (uint256) {
        address to = recipient();
        eq(to, address(b), "the hook's record names this contract");
        vm.deal(HOOK, HOOK.balance + 0.02 ether);
        vm.prank(HOOK);
        ESCROW_CREDIT.credit{value: 0.02 ether}(to);
        return ESCROW.balanceOf(address(b));
    }

    /// The fee recipient in the hook's launch record (its fifth word).
    function recipient() internal view returns (address) {
        (bool done, bytes memory r) = HOOK.staticcall(abi.encodeWithSelector(0xad091230, PID));
        ok(done, "launch record");
        bytes32 w;
        assembly {
            w := mload(add(r, 160))
        }
        return address(uint160(uint256(w)));
    }

    function test_theLaunchpadsOwnFunctionHandsTheFeesOver() public {
        eq(recipient(), address(b), "recipient is the burn contract");
        vm.prank(stranger);
        vm.expectRevert();
        ILaunchFactory(FACTORY).transferCreatorFeeRecipient(CORBEL, stranger);
        vm.prank(CREATOR);
        vm.expectRevert();
        ILaunchFactory(FACTORY).transferCreatorFeeRecipient(CORBEL, CREATOR);
        vm.prank(CREATOR);
        vm.expectRevert();
        ILaunchFactory(FACTORY).setCreatorFeeRecipient(CORBEL, CREATOR);
        eq(recipient(), address(b), "and the creator cannot take them back");
    }

    function test_afterThirtyDaysTheFeesGoBackAndTheRestStillBurns() public {
        vm.prank(team);
        vm.expectRevert(bytes("term"));
        b.finish();
        vm.warp(b.ends() - 1);
        vm.expectRevert(bytes("term"));
        b.finish();
        uint256 fees = _fees();
        uint256 team0 = team.balance;
        vm.warp(b.ends());
        vm.prank(stranger); // not our button either
        b.finish();
        eq(recipient(), team, "the stream is the team's again");
        eq(team.balance - team0, fees - fees / 10, "what had come in by then was split as always");
        eq(b.budget(), fees / 10, "what was set aside stays");
        vm.expectRevert(bytes("finished"));
        b.finish();
        vm.prank(keeper);
        ok(b.burn(keccak256("last")) > 0, "and still burns");
        vm.prank(team);
        ILaunchFactory(FACTORY).transferCreatorFeeRecipient(CORBEL, CREATOR);
        eq(recipient(), CREATOR, "the team holds it like before");
    }

    function test_ifTheKeeperGoesSilentAnyoneCanBurnAgainstTheLastRecord() public {
        bytes32 root = keccak256("last root");
        _fees();
        vm.prank(keeper);
        b.burn(root);
        _fees();
        vm.warp(block.timestamp + 6 days);
        vm.prank(stranger);
        vm.expectRevert(bytes("keeper"));
        b.burn(root);
        vm.warp(block.timestamp + 1 days + 1);
        vm.startPrank(stranger);
        vm.expectRevert(bytes("keeper"));
        b.burn(keccak256("a record of their own"));
        ok(b.burn(root) > 0, "the burn does not depend on us");
        vm.stopPrank();
    }

    function _leaf(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }

    function test_realFeesSplitTenToNinetyAndBurnWithTheRecord() public {
        uint256 fees = _fees();
        ok(fees > 0, "the escrow credits this contract, not the creator");
        uint256 dead0 = IERC20Min(CORBEL).balanceOf(DEAD);
        uint256 team0 = team.balance;

        vm.prank(stranger); // anyone may collect
        b.collect();
        eq(b.budget(), fees / 10, "a tenth stays for the burn");
        eq(team.balance - team0, fees - fees / 10, "the rest is with the team in the same call");

        vm.prank(keeper);
        vm.expectRevert(bytes("no record"));
        b.burn(bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(bytes("keeper"));
        b.burn(bytes32(uint256(1)));

        bytes32 root = keccak256("root 1");
        vm.prank(keeper);
        uint256 out = b.burn(root);
        ok(out > 0, "bought");
        eq(IERC20Min(CORBEL).balanceOf(DEAD) - dead0, out, "every coin bought is burned");
        eq(IERC20Min(CORBEL).balanceOf(address(b)), 0, "none kept");
        eq(b.recordedAt(root), block.timestamp, "the record is written in the same transaction");
        eq(b.totalBurned(), out, "counted");
        eq(b.budget(), address(b).balance, "what is left is exactly what is set aside");

        vm.prank(keeper);
        vm.expectRevert(bytes("hourly"));
        b.burn(root);
    }

    function test_aWrongCheckDoublesTheShareForADayOnceAndNeverMore() public {
        string memory clean = "0x1111111111111111111111111111111111111111|123|honeypot:pass,exit:pass,owner:pass";
        string memory flagged = "0x2222222222222222222222222222222222222222|123|honeypot:fail";
        (bytes32 l1, bytes32 l2) = (_leaf(clean), _leaf(flagged));
        bytes32 root = l1 < l2 ? keccak256(abi.encodePacked(l1, l2)) : keccak256(abi.encodePacked(l2, l1));
        bytes32[] memory p1 = new bytes32[](1);
        p1[0] = l2;
        bytes32[] memory p2 = new bytes32[](1);
        p2[0] = l1;

        _fees();
        vm.prank(keeper);
        b.burn(root);
        eq(b.rate(), 1_000, "ten percent");

        vm.prank(keeper);
        vm.expectRevert(bytes("not sealed before"));
        b.wrong(clean, p1, root);
        vm.warp(block.timestamp + 2 hours);
        vm.startPrank(keeper);
        vm.expectRevert(bytes("flagged"));
        b.wrong(flagged, p2, root);
        vm.expectRevert(bytes("proof"));
        b.wrong("0x3333333333333333333333333333333333333333|1|honeypot:pass", p1, root);
        b.wrong(clean, p1, root);
        vm.expectRevert(bytes("counted"));
        b.wrong(clean, p1, root);
        vm.stopPrank();
        eq(b.rate(), 2_000, "twenty percent");

        uint256 before = b.budget();
        uint256 fees = _fees();
        b.collect();
        eq(b.budget() - before, fees / 5, "a fifth of what comes in that day");
        vm.warp(block.timestamp + 1 days);
        eq(b.rate(), 1_000, "back to ten after a day");
    }

    function test_aLatePromiseCostsADayAtATimeUpToSevenAndItsDateIsFinal() public {
        bytes32 id = keccak256("tax file");
        uint64 due = uint64(block.timestamp + 3 days);
        vm.prank(keeper);
        b.commit(id, "Tax file", due);
        vm.prank(keeper);
        vm.expectRevert(bytes("made"));
        b.commit(id, "Tax file", due + 30 days);
        vm.expectRevert(bytes("not late"));
        b.late(id);
        for (uint256 i; i < 7; i++) {
            vm.warp(uint256(due) + 1 + i * 1 days);
            vm.prank(stranger); // not our button
            b.late(id);
            eq(b.rate(), 2_000, "late day");
            vm.expectRevert();
            b.late(id);
        }
        vm.warp(uint256(due) + 1 + 8 days);
        vm.expectRevert(bytes("spent"));
        b.late(id);
        eq(b.rate(), 1_000, "seven days is the most");

        bytes32 id2 = keccak256("on time");
        vm.startPrank(keeper);
        b.commit(id2, "On time", uint64(block.timestamp + 1 days));
        b.delivered(id2, "corbel.finance/changelog");
        vm.stopPrank();
        vm.warp(block.timestamp + 5 days);
        vm.expectRevert(bytes("not late"));
        b.late(id2);
    }

    function test_aGiftBurnsWholeAndNobodyCanTakeAnythingOut() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool sent,) = address(b).call{value: 0.05 ether}("");
        ok(sent, "gift");
        eq(b.budget(), 0.05 ether, "all of a gift is for the burn");
        uint256 t0 = team.balance;
        b.collect();
        eq(team.balance, t0, "the team gets none of it");
        vm.prank(stranger);
        vm.expectRevert(bytes("pm"));
        b.unlockCallback("");
        // every function the contract has that moves ETH or coins is exercised above; none names a recipient
        vm.prank(keeper);
        uint256 out = b.burn(keccak256("r"));
        ok(out > 0, "a gift buys and burns");
    }

    function test_thePriceBoundHoldsAndTheRestWaits() public {
        vm.deal(stranger, 100 ether);
        vm.prank(stranger);
        (bool sent,) = address(b).call{value: 50 ether}("");
        ok(sent, "a huge gift");
        vm.prank(keeper);
        b.burn(keccak256("r"));
        ok(b.budget() > 0, "the bound stopped it");
        eq(b.budget(), address(b).balance, "nothing lost");
        vm.prank(keeper);
        vm.expectRevert(bytes("hourly"));
        b.burn(keccak256("r"));
    }
}
