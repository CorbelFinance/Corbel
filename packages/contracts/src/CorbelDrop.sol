// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IERC20Min} from "./interfaces/External.sol";

/**
 * Reward drop. The season's whole budget is sent here before it starts, so anyone can see it waiting. Each round the
 * setter (the project's Safe) posts one Merkle root of (wallet, amount) and the round's total, which must already sit
 * here unallocated; everyone then claims their own amount with a proof. After the claim window, whatever nobody
 * claimed is burned to the dead address: it never goes back to the team. There is no withdraw and no way to change a
 * posted root. Leaves are keccak256(bytes.concat(keccak256(abi.encode(wallet, amount)))), pairs hashed sorted.
 */
contract CorbelDrop is ReentrancyGuard {
    using SafeTransfer for address;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address public immutable token;
    address public immutable setter;
    uint256 public immutable claimWindow;

    struct Round {
        bytes32 root;
        uint256 total;
        uint256 claimed;
        uint256 deadline;
        bool burned;
    }
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public claimedBy;
    /// coins promised to rounds and not yet claimed or burned
    uint256 public allocated;

    event RoundPosted(uint256 indexed round, bytes32 root, uint256 total, uint256 deadline);
    event Claimed(uint256 indexed round, address indexed wallet, uint256 amount);
    event Burned(uint256 indexed round, uint256 amount);

    constructor(address token_, address setter_, uint256 claimWindow_) {
        require(token_ != address(0) && setter_ != address(0) && claimWindow_ >= 1 days, "args");
        token = token_;
        setter = setter_;
        claimWindow = claimWindow_;
    }

    function post(uint256 round, bytes32 root, uint256 total) external {
        require(msg.sender == setter, "setter");
        require(rounds[round].root == bytes32(0) && root != bytes32(0) && total > 0, "round");
        require(IERC20Min(token).balanceOf(address(this)) >= allocated + total, "not funded");
        allocated += total;
        rounds[round] = Round(root, total, 0, block.timestamp + claimWindow, false);
        emit RoundPosted(round, root, total, block.timestamp + claimWindow);
    }

    function claim(uint256 round, address wallet, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Round storage r = rounds[round];
        require(r.root != bytes32(0) && block.timestamp <= r.deadline && !r.burned, "closed");
        require(!claimedBy[round][wallet], "claimed");
        bytes32 h = keccak256(bytes.concat(keccak256(abi.encode(wallet, amount))));
        for (uint256 i = 0; i < proof.length; i++) h = h < proof[i] ? keccak256(abi.encodePacked(h, proof[i])) : keccak256(abi.encodePacked(proof[i], h));
        require(h == r.root, "proof");
        require(r.claimed + amount <= r.total, "over total");
        claimedBy[round][wallet] = true;
        r.claimed += amount;
        allocated -= amount;
        token.safeTransfer(wallet, amount);
        emit Claimed(round, wallet, amount);
    }

    /// After the window anyone burns what was not claimed.
    function burnUnclaimed(uint256 round) external nonReentrant {
        Round storage r = rounds[round];
        require(r.root != bytes32(0) && block.timestamp > r.deadline && !r.burned, "open");
        r.burned = true;
        uint256 left = r.total - r.claimed;
        allocated -= left;
        if (left > 0) token.safeTransfer(DEAD, left);
        emit Burned(round, left);
    }
}
