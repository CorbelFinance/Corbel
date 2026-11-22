// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CorbelMandate} from "../CorbelMandate.sol";
import {IERC20Min, IPoolManager, IV2Router, IWETH, PoolKey} from "../interfaces/External.sol";

/**
 * "Try to break the mandate". NEVER deployed: the site runs its creation code inside one eth_call. The
 * constructor buys USDG on the real pool, deploys a real CorbelMandate with the demo rules, posts a 500 USDG
 * bond, lets the visitor's agent try a trade up to three times, and returns what happened (constructor
 * return data is the call's result). Everything is reverted with the call: nothing is ever sent.
 */
contract MandateLab {
    struct Try {
        uint8 venue; // 0 = V2 path [tokenIn, tokenOut], 1 = v4 pool
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint16 acceptBps; // V2: how far below the pool quote the agent's minOut sits
        PoolKey key; // v4 only
        uint8 repeat; // 1..3 attempts in a row
    }

    struct Attempt {
        uint8 rule; // CorbelMandate.Rule the trade broke (0 = none, it traded)
        bool traded;
        uint256 out;
        uint256 slashed;
        uint256 bondAfter;
        uint8 strikes;
        bool frozen;
    }

    IV2Router constant ROUTER = IV2Router(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;

    constructor(Try memory t) payable {
        IWETH(WETH).deposit{value: 3 ether}();
        IERC20Min(WETH).approve(address(ROUTER), type(uint256).max);
        address[] memory p = new address[](2);
        p[0] = WETH;
        p[1] = USDG;
        ROUTER.swapExactTokensForTokens(2 ether, 1, p, address(this), block.timestamp);

        CorbelMandate m = new CorbelMandate(
            ROUTER,
            PM,
            USDG,
            address(this),
            address(this),
            CorbelMandate.Rules({maxSlippageBps: 100, hourFrom: 0, hourTo: 0, weekdaysOnly: true, cooldown: 0, minBond: 100e6, slashBps: 1_000, strikesToFreeze: 3})
        );
        m.setLimit(USDG, true, 1_000e6, 2_000e6);
        m.setLimit(WETH, true, 0.5 ether, 1 ether);
        m.setLimit(NVDA, true, 100e18, 200e18);
        m.setLimit(address(0), true, 0.05 ether, 0.1 ether);

        // the owner's money in the vault, and the agent's bond
        uint256 usdg = IERC20Min(USDG).balanceOf(address(this));
        IERC20Min(USDG).transfer(address(m), usdg - 500e6);
        IERC20Min(WETH).transfer(address(m), 1 ether);
        (bool sent,) = address(m).call{value: 0.5 ether}("");
        require(sent, "eth");
        IERC20Min(USDG).approve(address(m), 500e6);
        m.postBond(500e6);
        m.approveV2Pool(WETH, USDG); // POOL rule: the owner approves the pool it lets the agent use, at today's price

        uint8 n = t.repeat == 0 ? 1 : t.repeat > 3 ? 3 : t.repeat;
        Attempt[] memory out = new Attempt[](n);
        for (uint8 i = 0; i < n; i++) {
            if (m.frozen()) {
                out[i] = Attempt(0, false, 0, 0, 0, m.strikes(), true);
                continue;
            }
            uint256 bondBefore = m.bond();
            uint8 rule = uint8(m.check(t.tokenIn, t.tokenOut, t.amountIn));
            bool traded;
            uint256 got;
            if (t.venue == 0) {
                address[] memory path = new address[](2);
                path[0] = t.tokenIn;
                path[1] = t.tokenOut;
                uint256 minOut = 1;
                if (rule == 0) {
                    uint256[] memory q = ROUTER.getAmountsOut(t.amountIn, path);
                    minOut = (q[1] * (10_000 - t.acceptBps)) / 10_000;
                }
                (traded, got) = m.tradeV2(path, t.amountIn, minOut, "lab");
            } else {
                (traded, got) = m.tradeV4(t.key, t.tokenIn, t.amountIn, "lab");
            }
            // a refusal that check() didn't predict came from the PRICE rule (quote or pool fee/hook) or the POOL rule
            if (!traded && rule == 0) rule = uint8(t.venue == 1 && (t.key.fee & 0x800000) == 0 && t.key.fee <= 10_000 && (t.key.hooks == address(0)) ? CorbelMandate.Rule.Pool : CorbelMandate.Rule.Price);
            out[i] = Attempt(traded ? 0 : rule, traded, got, bondBefore - m.bond(), m.bond(), m.strikes(), m.frozen());
        }

        bytes memory res = abi.encode(out);
        assembly {
            return(add(res, 32), mload(res))
        }
    }
}
