// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * Corbel Trust simulator. NEVER deployed: its runtime code is injected at a throwaway address through
 * an eth_call state override, together with an ETH balance. Nothing it does leaves the call.
 * It buys a token with ETH and sells it straight back, and reports what actually arrived at each step,
 * so the caller can tell taxes, honeypots and blocked sells apart.
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IV2PairFull {
    function token1() external view returns (address);
}

interface IWETH is IERC20 {
    function deposit() external payable;
}

interface IV2Pair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function swap(uint256, uint256, address, bytes calldata) external;
    function sync() external;
}

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(PoolKey memory, SwapParams memory, bytes calldata) external returns (int256);
    function settle() external payable returns (uint256);
    function sync(address) external;
    function take(address, address, uint256) external;
}

contract TrustSim {
    /// Raised inside the v4 unlock callback: a plain revert would roll back the stage and the measurements.
    error Stop(uint8 stage, bytes reason, uint256[8] results);

    // results[0..7]: buyExpected, buyReceived, sellSent, sellArrived, sellExpectedOut, sellReceived, gasBuy, gasSell
    uint256[8] internal r;
    uint8 internal stage; // 0 ok, 1 funding, 2 buy reverted, 3 transfer out of wallet reverted, 4 sell reverted
    bytes internal reason;

    receive() external payable {}

    function _out(uint256 amountIn, uint256 rIn, uint256 rOut) internal pure returns (uint256) {
        if (amountIn == 0 || rIn == 0 || rOut == 0) return 0;
        uint256 a = amountIn * 997;
        return (a * rOut) / (rIn * 1000 + a);
    }

    /// Uniswap V2: buy `token` with `amountIn` of `base` through `pair`, then sell everything back.
    /// wrap=true: base is WETH and is minted from the simulator's ETH balance.
    function simV2(address base, bool wrap, address pair, address token, uint256 amountIn)
        external
        returns (uint256[8] memory, uint8, bytes memory)
    {
        if (wrap) {
            try IWETH(base).deposit{value: amountIn}() {} catch (bytes memory e) { return _fail(1, e); }
        }
        // fold any unsynced surplus into the reserves first, or the round trip looks cheaper than it is
        try IV2Pair(pair).sync() {} catch {}
        try IERC20(base).transfer(pair, amountIn) returns (bool ok) {
            if (!ok) return _fail(1, "base transfer");
        } catch (bytes memory e) { return _fail(1, e); }

        bool isT0 = IV2Pair(pair).token0() == token;
        (uint112 a0, uint112 a1,) = IV2Pair(pair).getReserves();
        uint256 expected = _out(amountIn, isT0 ? a1 : a0, isT0 ? a0 : a1);
        r[0] = expected;

        uint256 before = IERC20(token).balanceOf(address(this));
        uint256 g = gasleft();
        try IV2Pair(pair).swap(isT0 ? expected : 0, isT0 ? 0 : expected, address(this), "") {}
        catch (bytes memory e) { return _fail(2, e); }
        r[6] = g - gasleft();
        uint256 got = IERC20(token).balanceOf(address(this)) - before;
        r[1] = got;
        if (got == 0) return _fail(2, "nothing received");

        (a0, a1,) = IV2Pair(pair).getReserves();
        uint256 resT = isT0 ? a0 : a1;
        uint256 resB = isT0 ? a1 : a0;
        r[2] = got;
        g = gasleft();
        // count only what our transfer added: a pair can hold unsynced surplus above its reserve
        uint256 pairBefore = IERC20(token).balanceOf(pair);
        try IERC20(token).transfer(pair, got) returns (bool ok) {
            if (!ok) return _fail(3, "transfer returned false");
        } catch (bytes memory e) { return _fail(3, e); }
        uint256 arrived = IERC20(token).balanceOf(pair) - pairBefore;
        r[3] = arrived;
        r[4] = _out(got, resT, resB);
        uint256 out = _out(arrived, resT, resB);
        uint256 bBefore = IERC20(base).balanceOf(address(this));
        try IV2Pair(pair).swap(isT0 ? 0 : out, isT0 ? out : 0, address(this), "") {}
        catch (bytes memory e) { return _fail(4, e); }
        r[7] = g - gasleft();
        r[5] = IERC20(base).balanceOf(address(this)) - bBefore;
        return (r, 0, "");
    }

    // ---------- Uniswap v4: native ETH (currency0) / token (currency1) pools ----------

    address internal pm;
    PoolKey internal key;
    uint256 internal amountV4;
    bool internal tokenIs1;
    uint8 internal mode; // 0 = buy-and-sell simulation, 1 = one-way quote
    bool internal qZeroForOne;

    uint160 constant MIN_SQRT = 4295128740;
    uint160 constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    /// Uniswap v4: buy the pool's token side with the other side (native ETH or an ERC-20), then sell back.
    function simV4(address poolManager, PoolKey calldata k, bool tokenIsCurrency1, uint256 amountIn)
        external
        returns (uint256[8] memory, uint8, bytes memory)
    {
        pm = poolManager;
        key = k;
        amountV4 = amountIn;
        tokenIs1 = tokenIsCurrency1;
        mode = 0;
        try IPoolManager(poolManager).unlock("") {} catch (bytes memory e) {
            if (e.length >= 4 && bytes4(e) == Stop.selector) {
                (uint8 st, bytes memory why, uint256[8] memory res) = abi.decode(_tail(e), (uint8, bytes, uint256[8]));
                return (res, st, why);
            }
            return _fail(2, e); // the pool manager or a hook refused the swap itself
        }
        return (r, 0, "");
    }

    function _tail(bytes memory e) internal pure returns (bytes memory t) {
        t = new bytes(e.length - 4);
        for (uint256 i = 0; i < t.length; i++) t[i] = e[i + 4];
    }

    function _stop(uint8 s, bytes memory why) internal view {
        revert Stop(s, why, r);
    }

    function _pay(IPoolManager P, address currency, uint256 amount) internal {
        if (currency == address(0)) {
            P.settle{value: amount}();
        } else {
            P.sync(currency);
            require(IERC20(currency).transfer(address(P), amount), "pay");
            P.settle();
        }
    }

    function _bal(address currency) internal view returns (uint256) {
        return currency == address(0) ? address(this).balance : IERC20(currency).balanceOf(address(this));
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == pm, "pm");
        IPoolManager P = IPoolManager(pm);
        if (mode == 1) return _quoteCallback(P);
        bool t1 = tokenIs1;
        address token = t1 ? key.currency1 : key.currency0;
        address base = t1 ? key.currency0 : key.currency1;

        // buy: exact `amountV4` of base in
        uint256 g = gasleft();
        int256 d = P.swap(key, SwapParams(t1, -int256(amountV4), t1 ? MIN_SQRT : MAX_SQRT), "");
        int128 dBase = t1 ? int128(d >> 128) : int128(d);
        int128 dTok = t1 ? int128(d) : int128(d >> 128);
        r[0] = uint256(uint128(dTok));
        _pay(P, base, uint256(uint128(-dBase)));
        uint256 before = IERC20(token).balanceOf(address(this));
        P.take(token, address(this), uint256(uint128(dTok)));
        r[6] = g - gasleft();
        uint256 got = IERC20(token).balanceOf(address(this)) - before;
        r[1] = got;
        if (got == 0) _stop(2, "nothing received");

        // sell: pay the token in first so a transfer tax shows up as a smaller credit
        r[2] = got;
        g = gasleft();
        P.sync(token);
        try IERC20(token).transfer(pm, got) returns (bool ok) {
            if (!ok) _stop(3, "transfer returned false");
        } catch (bytes memory e) {
            _stop(3, e);
        }
        uint256 arrived = P.settle();
        r[3] = arrived;
        int256 s;
        try P.swap(key, SwapParams(!t1, -int256(arrived), t1 ? MAX_SQRT : MIN_SQRT), "") returns (int256 v) {
            s = v;
        } catch (bytes memory e) {
            _stop(4, e);
        }
        int128 sBase = t1 ? int128(s >> 128) : int128(s);
        uint256 out = uint256(uint128(sBase));
        r[5] = out;
        uint256 b = _bal(base);
        P.take(base, address(this), out);
        r[7] = g - gasleft();
        require(_bal(base) - b == out, "base");
        return "";
    }

    // ---------- one-way quotes (Trade → Quote) ----------

    /// V2 exact-in swap. tokenIn is funded by the caller's state override (or wrapped from ETH when wrap=true).
    /// Returns what actually reached this contract, so transfer taxes on either side are included.
    function quoteV2(address pair, address tokenIn, uint256 amountIn, bool wrap)
        external
        returns (uint256 out, uint256 gasUsed, uint8 st, bytes memory why)
    {
        if (wrap) {
            try IWETH(tokenIn).deposit{value: amountIn}() {} catch (bytes memory e) { return (0, 0, 1, e); }
        }
        try IV2Pair(pair).sync() {} catch {}
        address t0 = IV2Pair(pair).token0();
        bool inIs0 = t0 == tokenIn;
        address tokenOut = inIs0 ? IV2PairFull(pair).token1() : t0;
        uint256 g = gasleft();
        uint256 pb = IERC20(tokenIn).balanceOf(pair);
        try IERC20(tokenIn).transfer(pair, amountIn) returns (bool ok) {
            if (!ok) return (0, 0, 1, "transfer returned false");
        } catch (bytes memory e) { return (0, 0, 1, e); }
        uint256 arrived = IERC20(tokenIn).balanceOf(pair) - pb;
        (uint112 a0, uint112 a1,) = IV2Pair(pair).getReserves();
        uint256 o = _out(arrived, inIs0 ? a0 : a1, inIs0 ? a1 : a0);
        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        try IV2Pair(pair).swap(inIs0 ? 0 : o, inIs0 ? o : 0, address(this), "") {}
        catch (bytes memory e) { return (0, 0, 2, e); }
        gasUsed = g - gasleft();
        out = IERC20(tokenOut).balanceOf(address(this)) - before;
    }

    /// v4 exact-in swap on one pool. Input is native ETH (from this contract's balance) or an ERC-20 funded by override.
    function quoteV4(address poolManager, PoolKey calldata k, bool zeroForOne, uint256 amountIn)
        external
        returns (uint256 out, uint256 gasUsed, uint8 st, bytes memory why)
    {
        pm = poolManager;
        key = k;
        amountV4 = amountIn;
        qZeroForOne = zeroForOne;
        mode = 1;
        try IPoolManager(poolManager).unlock("") returns (bytes memory res) {
            (out, gasUsed) = abi.decode(res, (uint256, uint256));
        } catch (bytes memory e) {
            return (0, 0, 2, e);
        }
    }

    function _quoteCallback(IPoolManager P) internal returns (bytes memory) {
        bool z = qZeroForOne;
        address cin = z ? key.currency0 : key.currency1;
        address cout = z ? key.currency1 : key.currency0;
        uint256 g = gasleft();
        int256 d = P.swap(key, SwapParams(z, -int256(amountV4), z ? MIN_SQRT : MAX_SQRT), "");
        int128 dIn = z ? int128(d >> 128) : int128(d);
        int128 dOut = z ? int128(d) : int128(d >> 128);
        _pay(P, cin, uint256(uint128(-dIn)));
        uint256 b = _bal(cout);
        P.take(cout, address(this), uint256(uint128(dOut)));
        uint256 got = _bal(cout) - b;
        return abi.encode(got, g - gasleft());
    }

    function _fail(uint8 s, bytes memory e) internal returns (uint256[8] memory, uint8, bytes memory) {
        stage = s;
        reason = e;
        return (r, s, e);
    }
}
