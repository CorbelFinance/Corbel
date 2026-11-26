import { encodeFunctionData, formatUnits, keccak256, parseUnits, toHex, encodePacked, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { guardWait } from "@/lib/guard";
import { devClient, devchain, devSend } from "@/lib/devchain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Swaps without ETH (CorbelGasless) on the test fork. A test wallet holds USDG and no ETH at all: it signs a USDG
 * permit and a swap intent (path, floor, relayer fee, deadline, nonce), and a relayer submits both and pays the gas.
 *   GET  → the wallet's ETH, USDG and WETH, and the contract
 *   POST {amount} → signs and relays one USDG → WETH swap, returns before and after
 * The test wallet's key is made from a fixed phrase and only ever used on the fork. On the live site the visitor's own
 * wallet signs the same two messages once the contract is deployed.
 */
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Hex;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Hex;
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as Hex;
const OWNER = privateKeyToAccount(keccak256(toHex("corbel fork-only gasless test wallet")));
const FEE = parseUnits("0.05", 6);
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const ROUTER_ABI = [{ type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address[]" }], outputs: [{ type: "uint256[]" }] }] as const;
const G = [
  {
    type: "function", name: "swap", stateMutability: "nonpayable",
    inputs: [
      { type: "tuple", components: [{ name: "owner", type: "address" }, { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "pathHash", type: "bytes32" }, { name: "minOut", type: "uint256" }, { name: "fee", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" }] },
      { type: "address[]" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function balances() {
  const c = devClient()!;
  const [eth, usdg, weth] = await Promise.all([
    c.getBalance({ address: OWNER.address }),
    c.readContract({ address: USDG, abi: ERC20, functionName: "balanceOf", args: [OWNER.address] }),
    c.readContract({ address: WETH, abi: ERC20, functionName: "balanceOf", args: [OWNER.address] }),
  ]);
  return { eth: formatUnits(eth, 18), usdg: formatUnits(usdg, 6), weth: formatUnits(weth, 18) };
}

/** The test wallet starts with USDG and exactly zero ETH, so a swap that works proves no gas came from it. */
async function prepare() {
  const d = devchain()!, c = devClient()!;
  await c.request({ method: "anvil_setBalance", params: [OWNER.address, "0x0"] } as never);
  const have = await c.readContract({ address: USDG, abi: ERC20, functionName: "balanceOf", args: [OWNER.address] });
  if (have < parseUnits("5", 6)) await devSend(USDG, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [OWNER.address, parseUnits("50", 6)] }), 0n, d.dev);
}

export async function GET(req: Request) {
  const d = devchain();
  if (!d?.gasless || !devClient()) return Response.json({ mode: "off", error: "Swaps without ETH run on the test fork until the contract is deployed." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  try {
    await prepare();
    return Response.json({ mode: "fork", contract: d.gasless, wallet: OWNER.address, fee: formatUnits(FEE, 6), balances: await balances() });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  } finally {
    g.release();
  }
}

export async function POST(req: Request) {
  const d = devchain(), c = devClient();
  if (!d?.gasless || !c) return Response.json({ error: "The test fork is off." }, { status: 503 });
  const g = await guardWait(req, "account");
  if ("blocked" in g) return g.blocked;
  const j = (await req.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = Number(j?.amount);
  if (!(amount >= 0.5 && amount <= 25)) return (g.release(), Response.json({ error: "Pick an amount from 0.5 to 25 USDG." }, { status: 400 }));
  try {
    await prepare();
    const before = await balances();
    const amountIn = parseUnits(String(amount), 6);
    const path = [USDG, WETH] as Hex[];
    const quote = await c.readContract({ address: ROUTER, abi: ROUTER_ABI, functionName: "getAmountsOut", args: [amountIn - FEE, path] });
    const minOut = (quote[1]! * 99n) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const block = await c.getBlock();
    const dl = deadline > block.timestamp + 300n ? deadline : block.timestamp + 600n;
    const nonce = BigInt(Date.now());
    const it = { owner: OWNER.address, tokenIn: USDG, amountIn, pathHash: keccak256(encodePacked(["address[]"], [path])), minOut, fee: FEE, deadline: dl, nonce };
    // the two signatures the wallet makes: the intent, and the USDG permit for exactly amountIn
    const sig = await OWNER.signTypedData({
      domain: { name: "Corbel gasless", version: "1", chainId: 4663, verifyingContract: d.gasless },
      types: { Intent: [{ name: "owner", type: "address" }, { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "pathHash", type: "bytes32" }, { name: "minOut", type: "uint256" }, { name: "fee", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" }] },
      primaryType: "Intent",
      message: it,
    });
    const pn = await c.readContract({ address: USDG, abi: ERC20, functionName: "nonces", args: [OWNER.address] });
    const psig = await OWNER.signTypedData({
      domain: { name: "Global Dollar", version: "1", chainId: 4663, verifyingContract: USDG },
      types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      primaryType: "Permit",
      message: { owner: OWNER.address, spender: d.gasless, value: amountIn, nonce: pn, deadline: dl },
    });
    const split = (s: Hex) => ({ r: `0x${s.slice(2, 66)}` as Hex, s: `0x${s.slice(66, 130)}` as Hex, v: parseInt(s.slice(130, 132), 16) });
    const a = split(sig), p = split(psig);
    // the relayer (the fork's test address) submits and pays the gas
    const tx = await devSend(d.gasless, encodeFunctionData({ abi: G, functionName: "swap", args: [it, path, a.v, a.r, a.s, p.v, p.r, p.s] }), 0n, d.dev);
    return Response.json({ ok: true, tx, before, after: await balances(), fee: formatUnits(FEE, 6), minOut: formatUnits(minOut, 18) });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 240) }, { status: 502 });
  } finally {
    g.release();
  }
}
