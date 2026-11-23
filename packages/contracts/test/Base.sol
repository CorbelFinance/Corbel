// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// Foundry cheatcodes used by these tests (no forge-std: nothing is downloaded).
interface Vm {
    function deal(address who, uint256 amount) external;
    function prank(address who) external;
    function startPrank(address who) external;
    function stopPrank() external;
    function warp(uint256 t) external;
    function expectRevert(bytes calldata reason) external;
    function expectRevert() external;
    function label(address who, string calldata name) external;
    function addr(uint256 pk) external returns (address);
    function sign(uint256 pk, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
}

abstract contract Base {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function eq(uint256 a, uint256 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": ", _s(a), " != ", _s(b)));
    }

    function eq(address a, address b, string memory what) internal pure {
        require(a == b, what);
    }

    function ok(bool c, string memory what) internal pure {
        require(c, what);
    }

    function gte(uint256 a, uint256 b, string memory what) internal pure {
        if (a < b) revert(string.concat(what, ": ", _s(a), " < ", _s(b)));
    }

    function lte(uint256 a, uint256 b, string memory what) internal pure {
        if (a > b) revert(string.concat(what, ": ", _s(a), " > ", _s(b)));
    }

    /// |a - b| <= b * bps / 10000
    function near(uint256 a, uint256 b, uint256 bps, string memory what) internal pure {
        uint256 d = a > b ? a - b : b - a;
        if (d * 10_000 > b * bps) revert(string.concat(what, ": ", _s(a), " vs ", _s(b)));
    }

    function _s(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v > 0) {
            b = abi.encodePacked(bytes1(uint8(48 + (v % 10))), b);
            v /= 10;
        }
        return string(b);
    }
}

/// Plain mintable token for local tests.
contract MockToken {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public immutable decimals;
    uint256 public totalSupply;
    uint256 public taxBps; // optional transfer tax, to test rejection of taxed assets
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 d) {
        decimals = d;
    }

    function setTax(uint256 bps) external {
        taxBps = bps;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        require(allowance[f][msg.sender] >= v, "allowance");
        allowance[f][msg.sender] -= v;
        _move(f, to, v);
        return true;
    }

    function _move(address f, address to, uint256 v) internal {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v;
        uint256 tax = (v * taxBps) / 10_000;
        balanceOf[to] += v - tax;
        totalSupply -= tax;
    }
}
