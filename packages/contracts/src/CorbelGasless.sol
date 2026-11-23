// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20Min, IV2Router} from "./interfaces/External.sol";
import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

/**
 * Swaps without ETH. The owner of a token that supports EIP-2612 permit (USDG does) signs two messages and pays no gas:
 * the permit, and an intent naming the path, the least it accepts, the fee a relayer earns (in the token sold), a
 * deadline and a nonce. Any relayer submits both and pays the gas; this contract takes the tokens, pays the relayer its
 * fee, swaps the rest through the V2 router and sends the output straight to the owner. The relayer cannot change the
 * path, the floor or the fee: they are signed. A nonce works once. Nothing is kept here: no owner, no admin.
 */
contract CorbelGasless is ReentrancyGuard {
    using SafeTransfer for address;

    struct Intent {
        address owner;
        address tokenIn;
        uint256 amountIn; // fee included
        bytes32 pathHash; // keccak256(abi.encodePacked(path))
        uint256 minOut;
        uint256 fee; // to the relayer, in tokenIn
        uint256 deadline;
        uint256 nonce;
    }

    IV2Router public immutable router;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant INTENT_TYPEHASH =
        keccak256("Intent(address owner,address tokenIn,uint256 amountIn,bytes32 pathHash,uint256 minOut,uint256 fee,uint256 deadline,uint256 nonce)");
    mapping(address => mapping(uint256 => bool)) public used;

    event Swapped(address indexed owner, address indexed relayer, address tokenIn, address tokenOut, uint256 amountIn, uint256 fee, uint256 amountOut, uint256 nonce);

    constructor(IV2Router router_) {
        router = router_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("Corbel gasless"), keccak256("1"), block.chainid, address(this))
        );
    }

    function digest(Intent calldata it) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(INTENT_TYPEHASH, it))));
    }

    /// v, r, s sign the intent; pv, pr, ps are the owner's EIP-2612 permit for amountIn to this contract until it.deadline
    function swap(Intent calldata it, address[] calldata path, uint8 v, bytes32 r, bytes32 s, uint8 pv, bytes32 pr, bytes32 ps)
        external
        nonReentrant
        returns (uint256 out)
    {
        require(block.timestamp <= it.deadline, "expired");
        require(!used[it.owner][it.nonce], "nonce used");
        require(path.length >= 2 && path[0] == it.tokenIn && keccak256(abi.encodePacked(path)) == it.pathHash, "path");
        require(it.fee < it.amountIn, "fee");
        address who = ecrecover(digest(it), v, r, s);
        require(who != address(0) && who == it.owner, "intent");
        used[it.owner][it.nonce] = true;

        // a permit someone already submitted would revert here: the allowance it set is what counts
        try IERC20Permit(it.tokenIn).permit(it.owner, address(this), it.amountIn, it.deadline, pv, pr, ps) {} catch {}
        it.tokenIn.safeTransferFrom(it.owner, address(this), it.amountIn);
        if (it.fee > 0) it.tokenIn.safeTransfer(msg.sender, it.fee);
        uint256 rest = it.amountIn - it.fee;
        it.tokenIn.safeApprove(address(router), rest);
        address tokenOut = path[path.length - 1];
        uint256 had = IERC20Min(tokenOut).balanceOf(it.owner);
        router.swapExactTokensForTokens(rest, it.minOut, path, it.owner, it.deadline);
        out = IERC20Min(tokenOut).balanceOf(it.owner) - had;
        require(out >= it.minOut, "below floor");
        emit Swapped(it.owner, msg.sender, it.tokenIn, tokenOut, it.amountIn, it.fee, out, it.nonce);
    }
}
