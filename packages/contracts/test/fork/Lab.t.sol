// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.sol";
import {MandateLab} from "../../src/lab/MandateLab.sol";
import {PoolKey} from "../../src/interfaces/External.sol";

/// The "Break it" lab on the new mandate code: an honest V2 trade still trades, a loose price is still slashed.
contract LabForkTest is Base {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    function _run(uint256 amountIn, uint16 acceptBps, uint8 repeat, address tin, address tout) internal returns (MandateLab.Attempt[] memory) {
        uint256 t = block.timestamp - (block.timestamp % 1 days) + 12 hours + 1 days;
        while ((t / 1 days + 4) % 7 != 3) t += 1 days;
        vm.warp(t);
        vm.deal(address(this), 10 ether);
        PoolKey memory k;
        bytes memory code = abi.encodePacked(type(MandateLab).creationCode, abi.encode(MandateLab.Try(0, tin, tout, amountIn, acceptBps, k, repeat)));
        (bool okCall, bytes memory ret) = address(new Caller()).call{value: 4 ether}(code);
        require(okCall, "lab reverted");
        return abi.decode(ret, (MandateLab.Attempt[]));
    }

    function test_honestTradeTrades() public {
        MandateLab.Attempt[] memory a = _run(0.2 ether, 50, 1, WETH, USDG);
        ok(a[0].traded, "honest trade traded");
    }

    function test_loosePriceIsSlashed() public {
        MandateLab.Attempt[] memory a = _run(0.1 ether, 500, 1, WETH, USDG);
        ok(!a[0].traded, "refused");
        eq(a[0].rule, 4, "PRICE");
        eq(a[0].slashed, 50e6, "10% of the bond");
    }

    function test_budgetScenario() public {
        MandateLab.Attempt[] memory a = _run(900e6, 50, 3, USDG, WETH);
        ok(a[0].traded && a[1].traded, "first two inside the budget");
        eq(a[2].rule, 3, "third is BUDGET");
    }
}

/// Runs creation code and returns what the constructor returned (the site gets the same from an eth_call without `to`).
contract Caller {
    fallback(bytes calldata code) external payable returns (bytes memory) {
        address made;
        bytes memory c = code;
        assembly {
            made := create(callvalue(), add(c, 32), mload(c))
            if iszero(made) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
        return made.code; // the constructor's return data became the deployed code
    }
}
