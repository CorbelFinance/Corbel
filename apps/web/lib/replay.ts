/**
 * Failed sell replay: take a transaction that reverted, run its exact call again and say what stopped it.
 *
 * The node keeps the chain's state for only the newest few thousand blocks and offers no trace, so the call is run
 * with eth_call: on the block just before the transaction when that state is still kept, else on the state now (the
 * answer says which). The revert data is then read layer by layer: a standard reason string, a panic code, a known
 * custom error, or a pool manager's WrappedError, which names the contract that really reverted (a token, a hook)
 * and the function it was in. When that contract's source is verified, the reason is found in the source and the
 * exact line is returned with the lines around it.
 */
import { limitedFetch } from "@corbel/data/chain";
import { decodeAbiParameters, toFunctionSelector, type Hex } from "viem";

export type Layer = { contract: string; fn: string | null; error: string; args: string[]; explain: string };
export type CodeLine = { file: string; line: number; lines: { n: number; text: string }[] };
export type Replay =
  | { status: "ok"; tx: string; block: string }
  | {
      status: "failed";
      tx: string;
      block: string;
      from: string;
      to: string;
      /** "trace": read from the transaction's own execution, call by call; else run again on a block's state */
      replayedOn: "trace" | "block-before" | "now";
      /** the calls from the sender down to the one that failed (a trace only) */
      path: { contract: string; fn: string | null; failed: boolean }[];
      reproduced: boolean;
      outOfGas: boolean;
      layers: Layer[];
      stoppedBy: { contract: string; name: string | null; verified: boolean } | null;
      code: CodeLine[];
      raw: string | null;
    };

// through the shared RPC gate: its lanes, its limits and its other endpoints when one node refuses
const RPC = () => (process.env.RPC_URLS ?? process.env.RPC_URL ?? "").split(",")[0]!.split("#")[0]!.trim();
const SOURCES = () => (process.env.SOURCES_URL ?? "https://sourcify.dev/server").replace(/\/$/, "");
const CHAIN = 4663;

type RpcErr = { code: number; message: string; data?: unknown };
async function rpc<T>(method: string, params: unknown[]): Promise<{ result?: T; error?: RpcErr }> {
  const r = await limitedFetch(RPC(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  return (await r.json()) as { result?: T; error?: RpcErr };
}

// ---------------------------------------------------------------------------------------------------- the dictionary
const sel = (sig: string) => toFunctionSelector(`function ${sig}`).toLowerCase();
type Known = { sig: string; types: string[]; explain: (a: string[]) => string };
const KNOWN: Known[] = [
  { sig: "WrappedError(address,bytes4,bytes,bytes)", types: ["address", "bytes4", "bytes", "bytes"], explain: () => "The pool passed on an error raised by another contract." },
  { sig: "V4TooLittleReceived(uint256,uint256)", types: ["uint256", "uint256"], explain: () => "The price moved past your slippage limit: you would have received less than the minimum you set." },
  { sig: "V4TooMuchRequested(uint256,uint256)", types: ["uint256", "uint256"], explain: () => "The price moved past your slippage limit: the swap needed more than the maximum you set." },
  { sig: "DeadlinePassed(uint256)", types: ["uint256"], explain: () => "The transaction was mined after its deadline." },
  { sig: "TransactionDeadlinePassed()", types: [], explain: () => "The transaction was mined after its deadline." },
  { sig: "PriceLimitAlreadyExceeded(uint160,uint160)", types: ["uint160", "uint160"], explain: () => "The pool price was already past the limit the swap allowed." },
  { sig: "PriceLimitOutOfBounds(uint160)", types: ["uint160"], explain: () => "The swap's price limit was outside what the pool accepts." },
  { sig: "PoolNotInitialized()", types: [], explain: () => "The pool this sell went to has no price yet." },
  { sig: "CurrencyNotSettled()", types: [], explain: () => "A token in the swap was not paid in full: often a token that takes a fee on transfer." },
  { sig: "HookCallFailed()", types: [], explain: () => "The pool's hook contract failed." },
  { sig: "InvalidHookResponse()", types: [], explain: () => "The pool's hook answered in a way the pool does not accept." },
  { sig: "SwapAmountCannotBeZero()", types: [], explain: () => "The swap amount was zero." },
  { sig: "InsufficientBalance()", types: [], explain: () => "Not enough balance for this swap." },
  { sig: "ERC20InsufficientBalance(address,uint256,uint256)", types: ["address", "uint256", "uint256"], explain: () => "The wallet did not hold as many tokens as the sell tried to move." },
  { sig: "ERC20InsufficientAllowance(address,uint256,uint256)", types: ["address", "uint256", "uint256"], explain: () => "The router was not approved to move this many tokens: approve first." },
  { sig: "ERC20InvalidSender(address)", types: ["address"], explain: () => "The token refused to move coins from this sender." },
  { sig: "ERC20InvalidReceiver(address)", types: ["address"], explain: () => "The token refused to move coins to this receiver." },
  { sig: "OwnableUnauthorizedAccount(address)", types: ["address"], explain: () => "Only the contract's owner may do this." },
  { sig: "EnforcedPause()", types: [], explain: () => "The contract is paused by its owner." },
  { sig: "ReentrancyGuardReentrantCall()", types: [], explain: () => "The contract blocked a call back into itself." },
  { sig: "AllowanceExpired(uint256)", types: ["uint256"], explain: () => "The Permit2 approval for this token has expired: approve again." },
  { sig: "InsufficientAllowance(uint256)", types: ["uint256"], explain: () => "The Permit2 approval is smaller than the amount sold." },
  { sig: "InvalidNonce()", types: [], explain: () => "The signed permit was already used." },
  { sig: "SignatureExpired(uint256)", types: ["uint256"], explain: () => "The signed permit expired before the transaction was mined." },
  { sig: "InvalidSignature()", types: [], explain: () => "The signature did not match." },
  { sig: "TransferFailed()", types: [], explain: () => "A token transfer failed inside the swap." },
  { sig: "TransferFromFailed()", types: [], explain: () => "Moving the tokens out of the wallet failed: the token refused it." },
];
const BY_SEL = new Map(KNOWN.map((k) => [sel(k.sig), k]));
const WRAPPED = sel("WrappedError(address,bytes4,bytes,bytes)");
const STRING = "0x08c379a0", PANIC = "0x4e487b71";
const PANICS: Record<number, string> = {
  0x01: "An assert in the contract failed.",
  0x11: "A number went past its limit (overflow or underflow).",
  0x12: "A division by zero.",
  0x21: "A value outside an enum.",
  0x31: "Pop from an empty array.",
  0x32: "An array was read past its end.",
  0x41: "Too much memory.",
  0x51: "A call to an empty function pointer.",
};
// the plain words behind short reason strings common routers and tokens use
const REASONS: [RegExp, string][] = [
  [/^STF$|TRANSFER_FROM_FAILED/i, "Moving the tokens out of the wallet failed: the token refused it."],
  [/^TF$|^ST$|TRANSFER_FAILED/i, "A token transfer failed inside the swap."],
  [/INSUFFICIENT_OUTPUT_AMOUNT|Too little received/i, "The price moved past your slippage limit."],
  [/: K$/i, "The pool's balance check failed: usually a token that takes a fee on transfer."],
  [/trading.*(not|isn).*(open|enabled|active|started)/i, "The token's owner has not opened trading: sells are blocked by the token itself."],
  [/blacklist|blocked|bot/i, "The token blocks this wallet from moving its coins."],
  [/max.*(tx|transaction|wallet|sell)|exceeds.*(limit|max)/i, "The token limits how much one transaction or one wallet can move."],
  [/cooldown|wait/i, "The token makes wallets wait between trades."],
];
// the function a wrapped error says the reverting contract was in
const FNS: Record<string, string> = Object.fromEntries(
  [
    "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
    "afterSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),int256,bytes)",
    "beforeAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)",
    "transfer(address,uint256)",
    "transferFrom(address,address,uint256)",
    "approve(address,uint256)",
  ].map((s) => [sel(s), s.slice(0, s.indexOf("("))]),
);

/** Reads the revert data one layer at a time; a wrapped error opens into the contract that really failed. */
export function decodeRevert(data: string, outer: string): Layer[] {
  const out: Layer[] = [];
  let d = data.toLowerCase(), at = outer.toLowerCase(), fn: string | null = null;
  for (let depth = 0; depth < 6 && d.length >= 10; depth++) {
    const s = d.slice(0, 10), body = `0x${d.slice(10)}` as Hex;
    try {
      if (s === STRING) {
        const [msg] = decodeAbiParameters([{ type: "string" }], body) as [string];
        const hit = REASONS.find(([re]) => re.test(msg));
        out.push({ contract: at, fn, error: msg, args: [], explain: hit ? hit[1] : "The contract stopped the call with this message." });
        break;
      }
      if (s === PANIC) {
        const [code] = decodeAbiParameters([{ type: "uint256" }], body) as [bigint];
        out.push({ contract: at, fn, error: `Panic(0x${code.toString(16)})`, args: [], explain: PANICS[Number(code)] ?? "The contract hit an internal error." });
        break;
      }
      if (s === WRAPPED) {
        const [target, inFn, reason] = decodeAbiParameters([{ type: "address" }, { type: "bytes4" }, { type: "bytes" }, { type: "bytes" }], body) as [string, string, string, string];
        out.push({ contract: at, fn, error: "WrappedError", args: [target], explain: "The pool passed on an error raised by another contract." });
        at = target.toLowerCase();
        fn = FNS[inFn.toLowerCase()] ?? inFn;
        d = reason.toLowerCase();
        continue;
      }
      const k = BY_SEL.get(s);
      if (k) {
        const args = k.types.length ? (decodeAbiParameters(k.types.map((type) => ({ type })), body) as unknown[]).map(String) : [];
        out.push({ contract: at, fn, error: k.sig.slice(0, k.sig.indexOf("(")), args, explain: k.explain(args) });
        break;
      }
      out.push({ contract: at, fn, error: s, args: [], explain: "A custom error this tool does not know by name yet." });
      break;
    } catch {
      out.push({ contract: at, fn, error: s, args: [], explain: "The revert data could not be read." });
      break;
    }
  }
  if (!out.length) out.push({ contract: at, fn, error: "no reason", args: [], explain: "The contract stopped without giving a reason (a bare revert or require with no message)." });
  return out;
}

// ------------------------------------------------------------------------------------------------ verified source
type Src = { name: string | null; sources: Record<string, string>; abiErrors: Map<string, string> } | null;
const G = globalThis as unknown as { __corbelSrc?: Map<string, { at: number; v: Src }> };
const srcCache = (G.__corbelSrc ??= new Map());

/** The verified source of a contract, if any. A verified source never changes; a miss is asked again after a day. */
export async function sourceOf(address: string): Promise<Src> {
  const key = address.toLowerCase();
  const hit = srcCache.get(key);
  if (hit && (hit.v || Date.now() - hit.at < 86_400_000)) return hit.v;
  let v: Src = null;
  try {
    const r = await fetch(`${SOURCES()}/v2/contract/${CHAIN}/${key}?fields=sources,abi,compilation`, { signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const j = (await r.json()) as { sources?: Record<string, { content: string }>; abi?: { type: string; name?: string; inputs?: { type: string }[] }[]; compilation?: { name?: string } };
      const sources = Object.fromEntries(Object.entries(j.sources ?? {}).map(([f, s]) => [f, s.content]));
      const abiErrors = new Map((j.abi ?? []).filter((x) => x.type === "error" && x.name).map((x) => [sel(`${x.name}(${(x.inputs ?? []).map((i) => i.type).join(",")})`), x.name!]));
      v = Object.keys(sources).length ? { name: j.compilation?.name ?? null, sources, abiErrors } : null;
    }
  } catch {
    v = null;
  }
  // not on the open registry: the explorer's verified source, when an explorer key is set
  const ek = process.env.EXPLORER_KEY ?? process.env.XCHECK_BS_KEY;
  if (!v && ek) {
    try {
      const r = await fetch(`${process.env.EXPLORER_API_URL ?? ""}/4663/api/v2/smart-contracts/${address.toLowerCase()}?apikey=${ek}`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) {
        const j = (await r.json()) as { name?: string; file_path?: string; source_code?: string; additional_sources?: { file_path: string; source_code: string }[]; abi?: { type: string; name?: string; inputs?: { type: string }[] }[] };
        const sources: Record<string, string> = {};
        if (j.source_code) sources[j.file_path || "Contract.sol"] = j.source_code;
        for (const x of j.additional_sources ?? []) sources[x.file_path] = x.source_code;
        const abiErrors = new Map((j.abi ?? []).filter((x) => x.type === "error" && x.name).map((x) => [sel(`${x.name}(${(x.inputs ?? []).map((i) => i.type).join(",")})`), x.name!]));
        if (Object.keys(sources).length) v = { name: j.name ?? null, sources, abiErrors };
      }
    } catch {
      v = null;
    }
  }
  if (srcCache.size > 500) srcCache.delete(srcCache.keys().next().value!);
  srcCache.set(key, { at: Date.now(), v });
  return v;
}

/** Where in the source a reason is raised: the require or revert that carries the message or names the error. */
export function findLines(sources: Record<string, string>, error: string, around = 3): CodeLine[] {
  const esc = error.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pats = /^[A-Za-z_]\w*$/.test(error)
    ? [new RegExp(`revert\\s+${esc}\\s*\\(`), new RegExp(`require\\s*\\([^;]*,\\s*${esc}\\s*\\(`)]
    : [new RegExp(`["']${esc}["']`)];
  const out: CodeLine[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const lines = text.split("\n");
    lines.forEach((l, i) => {
      if (out.length < 3 && pats.some((p) => p.test(l)) && !/^\s*(\/\/|\*)/.test(l)) {
        const a = Math.max(0, i - around), b = Math.min(lines.length, i + around + 1);
        out.push({ file, line: i + 1, lines: lines.slice(a, b).map((text, k) => ({ n: a + k + 1, text: text.replace(/\t/g, "  ").slice(0, 160) })) });
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- the replay
type Tx = { from: string; to: string | null; input: string; value: string; gas: string; blockNumber: string | null };
type Receipt = { status: string; gasUsed: string; blockNumber: string };

const revertData = (e?: RpcErr) => {
  const d = e?.data;
  if (typeof d === "string" && d.startsWith("0x")) return d;
  if (d && typeof d === "object" && "data" in d && typeof (d as { data: unknown }).data === "string") return (d as { data: string }).data;
  return null;
};

type Frame = { to?: string; input?: string; output?: string; error?: string; revertReason?: string; calls?: Frame[] };
// a few more functions worth naming on the way down (routers, pairs, the pool manager)
const MORE_FNS: Record<string, string> = Object.fromEntries(
  ["swap(uint256,uint256,address,bytes)", "unlock(bytes)", "execute(bytes,bytes[],uint256)", "execute(bytes,bytes[])", "multicall(bytes[])", "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
   "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)", "settle()", "take(address,address,uint256)", "sync(address)", "swap(address,bool,int256,uint160,bytes)", "swap((address,address,uint24,int24,address),(bool,int256,uint160),bytes)", "unlockCallback(bytes)"]
    .map((x) => [sel(x), x.slice(0, x.indexOf("("))]),
);
const fnOf = (input?: string) => {
  const k = (input ?? "").slice(0, 10).toLowerCase();
  return k.length === 10 ? (FNS[k] ?? MORE_FNS[k] ?? k) : null;
};

/**
 * The transaction's own execution, from a node that keeps traces: the calls from the sender down to the deepest one
 * that failed, and what that one returned. Null when no node offers a trace.
 */
async function traceOf(hash: string): Promise<{ path: { contract: string; fn: string | null; failed: boolean }[]; origin: Frame } | null> {
  const r = await rpc<Frame>("debug_traceTransaction", [hash, { tracer: "callTracer" }]).catch(() => null);
  const root = r?.result;
  if (!root?.error) return null;
  const path: { contract: string; fn: string | null; failed: boolean }[] = [];
  let f: Frame = root;
  for (let depth = 0; depth < 32; depth++) {
    path.push({ contract: (f.to ?? "").toLowerCase(), fn: fnOf(f.input), failed: false });
    const next = [...(f.calls ?? [])].reverse().find((c) => c.error);
    if (!next) break;
    f = next;
  }
  path.at(-1)!.failed = true;
  return { path, origin: f };
}

export async function replay(hash: string): Promise<Replay | { error: string }> {
  const [t, r] = await Promise.all([rpc<Tx>("eth_getTransactionByHash", [hash]), rpc<Receipt>("eth_getTransactionReceipt", [hash])]);
  if (!t.result || !r.result) return { error: "No such transaction on Robinhood Chain (or it is not mined yet)." };
  const tx = t.result, rc = r.result, block = BigInt(rc.blockNumber);
  if (rc.status === "0x1") return { status: "ok", tx: hash, block: block.toString() };
  if (!tx.to) return { error: "This transaction created a contract: there is no sell to replay." };
  const call = { from: tx.from, to: tx.to, data: tx.input, value: tx.value, gas: tx.gas };
  // first choice: the transaction's own execution; no state can differ from the one it failed on
  const tr = await traceOf(hash);
  if (tr) {
    const o = tr.origin, at = tr.path.at(-1)!;
    const outGas = /out of gas/i.test(o.error ?? "");
    let ls: Layer[] = outGas ? [{ contract: at.contract, fn: at.fn, error: "out of gas", args: [], explain: "The transaction ran out of gas before it finished." }] : decodeRevert(o.output ?? "0x", at.contract);
    if (!outGas && ls[0] && !ls[0].fn) ls[0] = { ...ls[0], fn: at.fn };
    if (!outGas && ls.length === 1 && ls[0]!.error === "no reason" && o.revertReason) ls = [{ ...ls[0]!, error: o.revertReason, explain: "The contract stopped the call with this message." }];
    return finish(hash, block, tx, "trace", true, outGas, ls, o.output ?? null, tr.path);
  }
  // the state right before the transaction when the node still keeps it, else the state now
  let on: "block-before" | "now" = "block-before";
  let res = await rpc<string>("eth_call", [call, `0x${(block - 1n).toString(16)}`]);
  if (res.error && /historical state|missing trie|not available/i.test(res.error.message)) {
    on = "now";
    res = await rpc<string>("eth_call", [call, "latest"]);
  }
  const outOfGas = BigInt(rc.gasUsed) * 100n >= BigInt(tx.gas) * 98n;
  const raw = revertData(res.error);
  const reproduced = !!res.error;
  let layers: Layer[] = reproduced ? decodeRevert(raw ?? "0x", tx.to) : [];
  if (reproduced && !raw && /out of gas/i.test(res.error!.message)) layers = [{ contract: tx.to.toLowerCase(), fn: null, error: "out of gas", args: [], explain: "The transaction ran out of gas before it finished." }];
  if (!reproduced && outOfGas) layers = [{ contract: tx.to.toLowerCase(), fn: null, error: "out of gas", args: [], explain: "It used all the gas it was given. Replayed with the same gas on the state now, it goes through: send it again with a higher gas limit." }];
  return finish(hash, block, tx, on, reproduced, outOfGas, layers, raw, []);
}

/** The contract that really stopped it, its verified source and the line. */
async function finish(hash: string, block: bigint, tx: Tx, on: "trace" | "block-before" | "now", reproduced: boolean, outOfGas: boolean, layers: Layer[], raw: string | null, path: { contract: string; fn: string | null; failed: boolean }[]): Promise<Replay> {

  const last = layers.at(-1);
  let stoppedBy: { contract: string; name: string | null; verified: boolean } | null = null;
  let code: CodeLine[] = [];
  if (last) {
    const src = await sourceOf(last.contract);
    if (src && /^0x[0-9a-f]{8}$/.test(last.error)) {
      const named = src.abiErrors.get(last.error);
      if (named) last.error = named;
    }
    stoppedBy = { contract: last.contract, name: src?.name ?? null, verified: !!src };
    if (src && !["no reason", "out of gas"].includes(last.error) && !last.error.startsWith("Panic(")) code = findLines(src.sources, last.error);
  }
  return { status: "failed", tx: hash, block: block.toString(), from: tx.from, to: tx.to!, replayedOn: on, path, reproduced, outOfGas, layers, stoppedBy, code, raw };
}
