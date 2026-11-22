"use client";

/** The address bar the wallet tools share: any 0x address, or the linked wallet in one click. */
import { useEffect, useState } from "react";
import { useLinked } from "./wallet";

export function WalletPick({ onPick, busy, cta = "Read" }: { onPick: (a: string) => void; busy?: boolean; cta?: string }) {
  const { linked } = useLinked();
  const [a, setA] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    const first = q && /^0x[0-9a-fA-F]{40}$/.test(q) ? q : linked?.address;
    if (first && !a) void Promise.resolve().then(() => (setA(first), onPick(first)));
  }, [linked, a, onPick]);
  const go = (v: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return setErr("Paste a 0x address, 42 characters.");
    setErr(null);
    onPick(v);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(a.trim());
      }}
      className="mx-5 flex flex-wrap items-center gap-2 rounded-2xl border border-(--bay-edge) bg-(--bay-bg2) p-2"
    >
      <input value={a} onChange={(e) => setA(e.target.value.trim())} placeholder="Wallet address 0x…" aria-label="Wallet address" spellCheck={false} className="h-10 min-w-60 flex-1 rounded-xl border border-(--bay-edge) bg-(--bay-bg) px-3 font-mono text-[12px] text-text outline-none focus:border-(--bay-acc)" />
      {linked && linked.address.toLowerCase() !== a.toLowerCase() && (
        <button type="button" onClick={() => (setA(linked.address), go(linked.address))} className="bay-ghost h-10">
          My wallet
        </button>
      )}
      <button type="submit" disabled={busy} className="bay-btn">
        {busy ? "Reading…" : cta}
      </button>
      {err && <p className="w-full px-1 text-[12px] text-flesh">{err}</p>}
    </form>
  );
}
