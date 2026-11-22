// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// Minimal ERC-20. No owner. Children may restrict transfers through `_beforeTransfer`.
abstract contract ERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "allowance");
            unchecked {
                allowance[from][msg.sender] = a - value;
            }
        }
        _transfer(from, to, value);
        return true;
    }

    function _beforeTransfer(address from, address to) internal view virtual {}

    function _transfer(address from, address to, uint256 value) internal {
        _beforeTransfer(from, to);
        uint256 b = balanceOf[from];
        require(b >= value, "balance");
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        unchecked {
            balanceOf[to] += value;
        }
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        uint256 b = balanceOf[from];
        require(b >= value, "balance");
        unchecked {
            balanceOf[from] = b - value;
            totalSupply -= value;
        }
        emit Transfer(from, address(0), value);
    }
}
