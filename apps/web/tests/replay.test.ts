import { encodeAbiParameters, encodeErrorResult, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { decodeRevert, findLines } from "../lib/replay";

const ROUTER = "0x6861639c7b7e70021deb1786941afeb7659ddd45";
const TOKEN = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
const abi = parseAbi([
  "error Error(string)",
  "error Panic(uint256)",
  "error WrappedError(address target, bytes4 selector, bytes reason, bytes details)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
  "error TradingClosed()",
]);
const str = (m: string) => encodeErrorResult({ abi, errorName: "Error", args: [m] });

describe("decodeRevert", () => {
  it("reads a reason string and explains a known one", () => {
    const [l] = decodeRevert(str("Trading not enabled"), ROUTER);
    expect(l!.error).toBe("Trading not enabled");
    expect(l!.contract).toBe(ROUTER);
    expect(l!.explain).toMatch(/not opened trading/);
  });

  it("reads a panic code", () => {
    const [l] = decodeRevert(encodeErrorResult({ abi, errorName: "Panic", args: [0x11n] }), ROUTER);
    expect(l!.error).toBe("Panic(0x11)");
    expect(l!.explain).toMatch(/overflow/);
  });

  it("opens a pool's wrapped error into the token that really failed, and its function", () => {
    const inner = str("Max wallet exceeded");
    const transferSel = "0xa9059cbb";
    const data = encodeErrorResult({ abi, errorName: "WrappedError", args: [TOKEN, transferSel, inner, "0x"] });
    const ls = decodeRevert(data, ROUTER);
    expect(ls).toHaveLength(2);
    expect(ls[1]!.contract).toBe(TOKEN);
    expect(ls[1]!.fn).toBe("transfer");
    expect(ls[1]!.error).toBe("Max wallet exceeded");
    expect(ls[1]!.explain).toMatch(/limits how much/);
  });

  it("names a known custom error and its values", () => {
    const [l] = decodeRevert(encodeErrorResult({ abi, errorName: "ERC20InsufficientAllowance", args: [ROUTER, 0n, 5n] }), TOKEN);
    expect(l!.error).toBe("ERC20InsufficientAllowance");
    expect(l!.args.map((a) => a.toLowerCase())).toEqual([ROUTER, "0", "5"]);
    expect(l!.explain).toMatch(/approve/);
  });

  it("explains slippage", () => {
    const [l] = decodeRevert(encodeErrorResult({ abi, errorName: "V4TooLittleReceived", args: [10n, 9n] }), ROUTER);
    expect(l!.error).toBe("V4TooLittleReceived");
    expect(l!.explain).toMatch(/slippage/);
  });

  it("keeps an unknown custom error as its selector", () => {
    const [l] = decodeRevert(encodeErrorResult({ abi, errorName: "TradingClosed" }), TOKEN);
    expect(l!.error).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it("says when there is no reason at all", () => {
    const [l] = decodeRevert("0x", TOKEN);
    expect(l!.error).toBe("no reason");
  });

  it("never throws on broken data", () => {
    expect(() => decodeRevert(`0x08c379a0${encodeAbiParameters([{ type: "uint256" }], [1n]).slice(2, 20)}`, TOKEN)).not.toThrow();
  });
});

describe("findLines", () => {
  const src = {
    "src/Token.sol": [
      "contract Token {",
      "  error TradingClosed();",
      "  bool open;",
      "  // revert TradingClosed() in a comment does not count",
      "  function _update(address f, address t, uint256 v) internal {",
      "    if (!open) revert TradingClosed();",
      '    require(v <= max, "Max wallet exceeded");',
      "  }",
      "}",
    ].join("\n"),
  };

  it("finds the line that raises a custom error, not its declaration or a comment", () => {
    const [c] = findLines(src, "TradingClosed");
    expect(c!.file).toBe("src/Token.sol");
    expect(c!.line).toBe(6);
    expect(c!.lines.find((l) => l.n === 6)!.text).toMatch(/revert TradingClosed/);
  });

  it("finds the line that carries a reason string", () => {
    const [c] = findLines(src, "Max wallet exceeded");
    expect(c!.line).toBe(7);
  });

  it("finds nothing for a reason that is not there", () => {
    expect(findLines(src, "Something else")).toEqual([]);
  });
});
