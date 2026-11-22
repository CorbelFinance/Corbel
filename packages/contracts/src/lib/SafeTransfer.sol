// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// Transfers that accept tokens returning nothing and fail loudly on false or revert.
library SafeTransfer {
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "transfer");
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "transferFrom");
    }

    function safeApprove(address token, address spender, uint256 value) internal {
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, value));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "approve");
    }

    function sendEth(address to, uint256 value) internal {
        (bool ok,) = to.call{value: value}("");
        require(ok, "eth");
    }
}

abstract contract ReentrancyGuard {
    uint256 private _lock = 1;

    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }
}
