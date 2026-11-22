// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard, SafeTransfer} from "./lib/SafeTransfer.sol";
import {IV2Factory, IV2Pair, IV2Router} from "./interfaces/External.sol";

/**
 * A wallet a bot can trade from but never empty.
 *
 * The owner funds it and sets the rules. The agent key may only swap through the V2 router, only between
 * listed tokens, only up to a size per trade and per day, only within a slippage bound measured against
 * the pool in the same block, and the output always lands back in this vault. Only the owner can withdraw,
 * change rules or replace the agent; setting the agent to address(0) freezes trading at once.
 * Every trade carries a memo, so the decision log is on chain.
 * Every pair on the path must be one the owner approved; approval records the pair's price as a mark, and a trade
 * reverts while a pair sits more than the slippage bound away from it. So the agent can't route the owner's money
 * through a pool it made, nor move an approved pool and trade against its own move.
 */
contract CorbelAgentVault is ReentrancyGuard {
    using SafeTransfer for address;

    struct Limit {
        bool allowed;
        uint128 maxPerTrade; // input cap per trade, in this token's units
        uint128 maxPerDay; // input cap per UTC day
    }

    event AgentSet(address agent);
    event LimitSet(address indexed token, bool allowed, uint256 maxPerTrade, uint256 maxPerDay);
    event SlippageSet(uint256 bps);
    event Traded(address indexed agent, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 quote, string memo);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event PairApproved(address indexed pair, uint256 mark);

    IV2Router public immutable router;
    IV2Factory public immutable v2Factory;
    address public immutable owner;
    /// Owner-approved pairs: reserve1/reserve0 in Q96 at approval (0 = not approved).
    mapping(address => uint256) public pairMark;
    address public agent;
    uint16 public maxSlippageBps;
    mapping(address => Limit) public limits;
    mapping(address => mapping(uint256 => uint256)) public spentOnDay; // token => day => input spent

    constructor(IV2Router router_, address owner_, address agent_, uint16 maxSlippageBps_) {
        require(maxSlippageBps_ <= 1_000, "slippage");
        router = router_;
        v2Factory = IV2Factory(router_.factory());
        owner = owner_;
        agent = agent_;
        maxSlippageBps = maxSlippageBps_;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    // ---------- owner ----------

    function setAgent(address a) external onlyOwner {
        agent = a;
        emit AgentSet(a);
    }

    function setLimit(address token, bool allowed, uint128 maxPerTrade, uint128 maxPerDay) external onlyOwner {
        require(maxPerTrade <= maxPerDay, "limits");
        limits[token] = Limit(allowed, maxPerTrade, maxPerDay);
        emit LimitSet(token, allowed, maxPerTrade, maxPerDay);
    }

    /// Approve the pair of a and b at its current price, or move its mark; `ok` false revokes it.
    function approvePair(address a, address b, bool ok) external onlyOwner {
        address pair = v2Factory.getPair(a, b);
        require(pair != address(0), "no pair");
        uint256 mark = ok ? _price(pair) : 0;
        require(!ok || mark > 0, "empty pair");
        pairMark[pair] = mark;
        emit PairApproved(pair, mark);
    }

    function _price(address pair) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = IV2Pair(pair).getReserves();
        return r0 == 0 ? 0 : (uint256(r1) << 96) / r0;
    }

    function setMaxSlippage(uint16 bps) external onlyOwner {
        require(bps <= 1_000, "slippage");
        maxSlippageBps = bps;
        emit SlippageSet(bps);
    }

    function withdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        token.safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // ---------- agent ----------

    function remainingToday(address token) public view returns (uint256) {
        uint256 spent = spentOnDay[token][block.timestamp / 1 days];
        uint256 cap = limits[token].maxPerDay;
        return spent >= cap ? 0 : cap - spent;
    }

    function trade(address[] calldata path, uint256 amountIn, uint256 minOut, string calldata memo) external nonReentrant returns (uint256 out) {
        require(msg.sender == agent && agent != address(0), "agent");
        require(path.length >= 2, "path");
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        Limit memory li = limits[tokenIn];
        require(li.allowed && limits[tokenOut].allowed, "token not listed");
        require(amountIn > 0 && amountIn <= li.maxPerTrade, "trade too large");
        uint256 day = block.timestamp / 1 days;
        require(spentOnDay[tokenIn][day] + amountIn <= li.maxPerDay, "daily limit");
        spentOnDay[tokenIn][day] += amountIn;
        for (uint256 i = 0; i + 1 < path.length; i++) {
            address pair = v2Factory.getPair(path[i], path[i + 1]);
            uint256 mark = pairMark[pair];
            require(pair != address(0) && mark > 0, "pool not approved");
            uint256 cur = _price(pair);
            uint256 d = cur > mark ? cur - mark : mark - cur;
            require(d * 10_000 <= mark * maxSlippageBps, "price moved from the owner's mark");
        }

        // the pool's own quote in this block bounds how bad a fill the agent may accept
        uint256[] memory q = router.getAmountsOut(amountIn, path);
        uint256 quote = q[q.length - 1];
        uint256 floor = (quote * (10_000 - maxSlippageBps)) / 10_000;
        require(minOut >= floor, "slippage above limit");

        tokenIn.safeApprove(address(router), amountIn);
        uint256[] memory res = router.swapExactTokensForTokens(amountIn, minOut, path, address(this), block.timestamp);
        out = res[res.length - 1];
        for (uint256 i = 0; i + 1 < path.length; i++) {
            address pair = v2Factory.getPair(path[i], path[i + 1]);
            pairMark[pair] = _price(pair); // the mark follows the vault's own fill
        }
        emit Traded(msg.sender, tokenIn, tokenOut, amountIn, out, quote, memo);
    }
}
