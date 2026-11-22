"use client";

/**
 * Wallet sign-in (EIP-4361) on the client. The wallet signs one plain-text message: no transaction, no gas,
 * nothing moves. The session lives in an httpOnly cookie set by the server; this hook only mirrors who is signed in.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { stringToHex } from "viem";
import { createSiweMessage } from "viem/siwe";

type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type State = { address: string | null; exp: number | null; ready: boolean; google: boolean; googleOn: boolean };

const EVT = "corbel:session";
let state: State = { address: null, exp: null, ready: false, google: false, googleOn: false };
let loading: Promise<void> | null = null;

const set = (v: State) => {
  state = v;
  window.dispatchEvent(new Event(EVT));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};

async function load() {
  loading ??= fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => r.json() as Promise<{ address: string | null; exp: number | null; google?: boolean; googleOn?: boolean }>)
    .then((j) => set({ address: j.address, exp: j.exp, ready: true, google: !!j.google, googleOn: !!j.googleOn }))
    .catch(() => set({ ...state, ready: true }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Finds the wallet the address was linked from (EIP-6963 by rdns), else the injected one. */
function findProvider(rdns?: string): Promise<Provider | null> {
  return new Promise((resolve) => {
    let hit: Provider | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ info: { rdns: string }; provider: Provider }>).detail;
      if (!hit && d?.provider && (!rdns || d.info?.rdns === rdns)) hit = d.provider;
    };
    window.addEventListener("eip6963:announceProvider", on);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", on);
      resolve(hit ?? (window as unknown as { ethereum?: Provider }).ethereum ?? null);
    }, 150);
  });
}

export function useSession() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!state.ready) void load();
  }, []);

  /** Signs in the given address with its wallet. Returns an error to show, or null. */
  const signIn = useCallback(async (address: string, rdns?: string): Promise<string | null> => {
    const provider = await findProvider(rdns);
    if (!provider) return "No wallet found in this browser.";
    try {
      const accounts = ((await provider.request({ method: "eth_requestAccounts" })) as string[]).map((a) => a.toLowerCase());
      if (!accounts.includes(address.toLowerCase())) return "Switch the wallet to the linked address, then try again.";
      const { nonce } = (await (await fetch("/api/auth/nonce", { cache: "no-store" })).json()) as { nonce: string };
      const message = createSiweMessage({
        domain: location.host,
        address: address as `0x${string}`,
        statement: "Sign in to Corbel. This is a message, not a transaction: it costs no gas and moves nothing.",
        uri: location.origin,
        version: "1",
        chainId: 4663,
        nonce,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 5 * 60_000),
      });
      const signature = (await provider.request({ method: "personal_sign", params: [stringToHex(message), address] })) as string;
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const j = (await r.json()) as { address?: string; error?: string };
      if (!r.ok || !j.address) return j.error ?? "Sign-in failed.";
      await load();
      return null;
    } catch (e) {
      const code = (e as { code?: number }).code;
      return code === 4001 ? "You declined the signature." : "The wallet did not sign.";
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    set({ address: null, exp: null, ready: true, google: false, googleOn: state.googleOn });
  }, []);

  return { ...s, signIn, signOut };
}
