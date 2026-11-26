/**
 * Pay per call (x402, "exact" scheme in USDG). An agent with no account and no key calls /api/x402/<tool>; without a
 * payment it gets 402 and what to sign; it signs USDG's ReceiveWithAuthorization (EIP-3009) for the price and sends it
 * base64 in X-PAYMENT. We check the signature and terms here, settle it on chain from our own facilitator wallet (the
 * payee, so nobody can front-run the signature), then answer. No middleman, no fee on top.
 *
 * Off until X402_KEY (the facilitator wallet that receives the payments and pays the gas) is set on the server. The
 * USDG domain below was checked on chain: its DOMAIN_SEPARATOR matches name "Global Dollar", version "1", chain 4663.
 */
import { BRAND } from "@corbel/config";
import { createPublicClient, createWalletClient, http, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "@corbel/data/chain";
import { store } from "./store";

export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const;
export const NETWORK = "eip155:4663";
/** Price per call in USDG (6 decimals). A proposal until the owner sets prices. */
export const PRICES: Record<string, number> = { token: 0.01, preview: 0.01, replay: 0.01, ledger: 0.005 };
/** What each paid tool answers, for the list at /api/x402. */
export const TOOLS: Record<string, { method: "GET" | "POST"; ask: string; what: string }> = {
  token: { method: "GET", ask: "/api/x402/token?q=<token address>", what: "The seven token checks, with where and when each was read." },
  preview: { method: "POST", ask: "/api/x402/preview  {from, to, value?, data?}", what: "Every balance a transaction would move, before it is signed." },
  replay: { method: "GET", ask: "/api/x402/replay?tx=<hash>", what: "A failed transaction read back call by call: what refused, where and why." },
  ledger: { method: "GET", ask: "/api/x402/ledger?token=<address>", what: "A token's sealed verdicts with their proofs." },
};
const MAX_WINDOW_S = 120;

export const DOMAIN = { name: "Global Dollar", version: "1", chainId: 4663, verifyingContract: USDG } as const;
export const TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type Authorization = { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex };
export type PaymentHeader = { x402Version: number; scheme: string; network: string; payload: { signature: Hex; authorization: Authorization } };

const key = () => (/^0x[0-9a-fA-F]{64}$/.test(process.env.X402_KEY ?? "") ? (process.env.X402_KEY as Hex) : null);
export const payTo = () => (key() ? privateKeyToAccount(key()!).address.toLowerCase() : null);
export const paymentsOpen = () => !!key();
const raw = (usdg: number) => BigInt(Math.round(usdg * 1e6));

const db = () => store("x402", "CREATE TABLE IF NOT EXISTS paid (nonce TEXT PRIMARY KEY, payer TEXT NOT NULL, tool TEXT NOT NULL, value TEXT NOT NULL, tx TEXT, at INTEGER NOT NULL);");

/** The 402 body: what to sign for this call. */
/** The public address of a paid call: agents compare it with what they asked, so never the server's own localhost. */
function publicResource(resource: string) {
  try {
    const u = new URL(resource);
    return `https://${BRAND.domains.site}${u.pathname}${u.search}`;
  } catch {
    return resource;
  }
}

export function requirements(tool: string, resourceIn: string) {
  const resource = publicResource(resourceIn);
  return {
    x402Version: 1,
    error: "Payment required",
    accepts: [{ scheme: "exact", network: NETWORK, maxAmountRequired: raw(PRICES[tool] ?? 0).toString(), resource, description: `Corbel ${tool}`, mimeType: "application/json", payTo: payTo(), maxTimeoutSeconds: MAX_WINDOW_S, asset: USDG, extra: { name: DOMAIN.name, version: DOMAIN.version, primaryType: "ReceiveWithAuthorization" } }],
  };
}

/** Checks a payment header against the price and the payee, without touching the chain. Returns the reason it fails, or null. */
export async function verify(h: PaymentHeader, tool: string, to: string, now = Math.floor(Date.now() / 1000)): Promise<string | null> {
  if (h?.scheme !== "exact" || h.network !== NETWORK) return "Wrong scheme or network.";
  const a = h.payload?.authorization;
  if (!a || !h.payload.signature) return "No authorization.";
  if (a.to.toLowerCase() !== to.toLowerCase()) return "Pays the wrong address.";
  if (BigInt(a.value) < raw(PRICES[tool] ?? Infinity)) return "Pays less than the price.";
  const after = Number(a.validAfter), before = Number(a.validBefore);
  if (after > now || before <= now + 5) return "Outside its valid time.";
  if (before - Math.max(after, now) > MAX_WINDOW_S) return `Valid for longer than ${MAX_WINDOW_S} s.`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) return "Bad nonce.";
  if (db()?.prepare("SELECT 1 FROM paid WHERE nonce = ?").get(a.nonce.toLowerCase())) return "This payment was already used.";
  const signer = await recoverTypedDataAddress({ domain: DOMAIN, types: TYPES, primaryType: "ReceiveWithAuthorization", message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) }, signature: h.payload.signature }).catch(() => null);
  if (!signer || signer.toLowerCase() !== a.from.toLowerCase()) return "The signature is not the payer's.";
  return null;
}

const RECEIVE = [{ type: "function", name: "receiveWithAuthorization", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "signature", type: "bytes" }], outputs: [] }] as const;

const args = (h: PaymentHeader) => {
  const a = h.payload.authorization;
  return [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, h.payload.signature] as const;
};
const chain = () => createPublicClient({ chain: robinhood, transport: http(process.env.RPC_URL) });

/** A dry run of the transfer: the payer holds the USDG and the signature works on the token itself. Costs no gas. */
export async function canPay(h: PaymentHeader): Promise<string | null> {
  const k = key();
  if (!k || !process.env.RPC_URL) return "Paid calls are not open.";
  try {
    await chain().simulateContract({ account: privateKeyToAccount(k), address: USDG, abi: RECEIVE, functionName: "receiveWithAuthorization", args: args(h) });
    return null;
  } catch {
    return "This payment would not go through: not enough USDG, or the token refused the signature.";
  }
}

/**
 * Settles a verified payment on chain from the facilitator wallet and waits until a block holds it. The nonce is
 * recorded first, so one payment never pays twice; a transfer that fails frees it again.
 */
export async function settle(h: PaymentHeader, tool: string): Promise<{ tx: Hex } | { error: string }> {
  const k = key();
  if (!k || !process.env.RPC_URL) return { error: "Paid calls are not open." };
  const a = h.payload.authorization;
  const d = db();
  const ins = d?.prepare("INSERT OR IGNORE INTO paid (nonce, payer, tool, value, at) VALUES (?, ?, ?, ?, ?)").run(a.nonce.toLowerCase(), a.from.toLowerCase(), tool, a.value, Date.now());
  if (!ins || Number(ins.changes) === 0) return { error: "This payment was already used." };
  try {
    const w = createWalletClient({ account: privateKeyToAccount(k), chain: robinhood, transport: http(process.env.RPC_URL) });
    const tx = await w.writeContract({ address: USDG, abi: RECEIVE, functionName: "receiveWithAuthorization", args: args(h) });
    const r = await chain().waitForTransactionReceipt({ hash: tx, timeout: 30_000 });
    if (r.status !== "success") throw new Error("the transfer reverted");
    d?.prepare("UPDATE paid SET tx = ? WHERE nonce = ?").run(tx, a.nonce.toLowerCase());
    return { tx };
  } catch (e) {
    d?.prepare("DELETE FROM paid WHERE nonce = ? AND tx IS NULL").run(a.nonce.toLowerCase());
    return { error: `The payment did not settle: ${(e as Error).message?.split("\n")[0]?.slice(0, 120)}` };
  }
}

/** Settled paid calls, newest first, and their totals: the public record on the Pay per call page. */
export function paidCalls(limit = 25) {
  const d = db();
  if (!d) return { calls: [], count: 0, usdg: 0 };
  const calls = (d.prepare("SELECT payer, tool, value, tx, at FROM paid WHERE tx IS NOT NULL ORDER BY at DESC LIMIT ?").all(limit) as { payer: string; tool: string; value: string; tx: string; at: number }[]).map((r) => ({ payer: r.payer, tool: r.tool, usdg: Number(r.value) / 1e6, tx: r.tx, at: r.at }));
  const t = d.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CAST(value AS INTEGER)), 0) AS v FROM paid WHERE tx IS NOT NULL").get() as { n: number; v: number };
  return { calls, count: t.n, usdg: t.v / 1e6 };
}

export const decodeHeader = (v: string | null): PaymentHeader | null => {
  if (!v) return null;
  try {
    return JSON.parse(Buffer.from(v, "base64").toString("utf8")) as PaymentHeader;
  } catch {
    return null;
  }
};
export const encodeResponse = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
