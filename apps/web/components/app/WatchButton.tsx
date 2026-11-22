"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "@corbel/ui";
import { useSession } from "./session";

type Item = { kind: "token" | "address"; value: string; label: string; added: number };

// one watchlist per page, shared by every Watch button and the account panel
const EVT = "corbel:watch";
let items: Item[] | null = null;
let loading: Promise<void> | null = null;
let loadedFor: string | null = null; // the address the list was loaded for: one load per page per address
const emit = () => window.dispatchEvent(new Event(EVT));
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};

export function loadWatch(force = false) {
  if (loading && !force) return loading;
  loading = fetch("/api/account/watch", { cache: "no-store" })
    .then((r): Promise<{ items: Item[] | null }> | { items: null } => (r.ok ? (r.json() as Promise<{ items: Item[] }>) : { items: null }))
    .then((j) => {
      items = j.items;
      emit();
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}
export const setWatch = (next: Item[] | null) => {
  items = next;
  emit();
};

export function useWatch() {
  const list = useSyncExternalStore(subscribe, () => items, () => null);
  const { address } = useSession();
  useEffect(() => {
    if (!address) {
      if (loadedFor !== null) {
        loadedFor = null;
        setWatch(null);
      }
      return;
    }
    if (loadedFor === address) return; // every button shares one load
    loadedFor = address;
    void loadWatch(true);
  }, [address]);
  return list;
}

/** Saves a token or wallet to the signed-in account's watchlist; asks to sign in otherwise. */
export function WatchButton({ kind, value, label, className }: { kind: "token" | "address"; value: string; label?: string; className?: string }) {
  const { address, ready } = useSession();
  const list = useWatch();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const saved = !!list?.some((i) => i.value.toLowerCase() === value.toLowerCase());

  const toggle = async () => {
    if (!address) {
      setHint(true);
      return;
    }
    setBusy(true);
    try {
      const r = saved
        ? await fetch(`/api/account/watch?value=${value}`, { method: "DELETE" })
        : await fetch("/api/account/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, value, label: label ?? "" }) });
      if (r.ok) setWatch(((await r.json()) as { items: Item[] }).items);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={cx("relative inline-flex items-center", className)}>
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void toggle()}
        aria-pressed={saved}
        className={cx("font-medium text-[12px] uppercase tracking-[0.08em] transition-colors disabled:opacity-60", saved ? "text-leaf" : "text-muted hover:text-text")}
        title={saved ? "Remove from your watchlist" : "Save to your watchlist"}
      >
        {saved ? "★ Watching" : "☆ Watch"}
      </button>
      {hint && !address && (
        <span role="status" className="absolute right-0 top-full z-20 mt-2 w-56 border border-line bg-bg p-3 text-left text-xs text-muted shadow-lg">
          Sign in with your wallet to keep a watchlist.{" "}
          <Link href="/app/account/dashboard" className="text-leaf underline underline-offset-2">
            Sign in →
          </Link>
          <button type="button" onClick={() => setHint(false)} className="ml-2 text-muted hover:text-text" aria-label="Close">
            ×
          </button>
        </span>
      )}
    </span>
  );
}
