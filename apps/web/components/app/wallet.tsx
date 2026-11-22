"use client";

/**
 * Read-only wallet link. Connecting asks the wallet for its address (eth_requestAccounts) and nothing else:
 * no signature, no chain switch, no transaction. Wallets are discovered with EIP-6963 so every installed
 * wallet shows up by name. The address lives in this browser only.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cx } from "@corbel/ui";
import { short } from "./kit";
import { useSession } from "./session";
import { pageZoom } from "../../lib/zoom";

type Info = { uuid: string; name: string; icon: string; rdns: string };
type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Announced = { info: Info; provider: Provider };
type Linked = { address: string; via: "wallet" | "watch"; name?: string; rdns?: string };

const KEY = "corbel.wallet";
const EVT = "corbel:wallet";

function read(): Linked | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Linked) : null;
    return v && /^0x[0-9a-fA-F]{40}$/.test(v.address) ? v : null;
  } catch {
    return null;
  }
}
let snap: Linked | null | undefined;
const getSnap = () => (snap === undefined ? (snap = read()) : snap);
function write(v: Linked | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage off: keep it for this page only */
  }
  snap = v;
  window.dispatchEvent(new Event(EVT));
}
function subscribe(cb: () => void) {
  const on = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snap = read();
      cb();
    }
  };
  window.addEventListener(EVT, on);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, on);
    window.removeEventListener("storage", onStorage);
  };
}

/** The linked address (wallet or watched), shared by every tool on the page. */
export function useLinked() {
  const local = useSyncExternalStore(subscribe, getSnap, () => null);
  // signed in without a wallet linked in this browser (a sign-in from another device or a one-time link):
  // the signed-in address is the linked one, so the header, portfolio and account all show it
  const auth = useSession();
  const linked: Linked | null = local ?? (auth.address ? { address: auth.address, via: "wallet", name: "Signed in" } : null);
  return {
    linked,
    link: (v: Linked) => write(v),
    unlink: () => {
      write(null);
      if (!local && auth.address) void auth.signOut();
    },
  };
}

function useWallets() {
  const [list, setList] = useState<Announced[]>([]);
  useEffect(() => {
    const seen = new Map<string, Announced>();
    const on = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      if (!d?.info?.uuid || seen.has(d.info.uuid)) return;
      seen.set(d.info.uuid, d);
      setList([...seen.values()]);
    };
    window.addEventListener("eip6963:announceProvider", on);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", on);
  }, []);
  return list;
}

/** Header control: connect (read-only) or watch an address; when linked, a menu with the address. */
export function WalletButton() {
  const { linked, unlink } = useLinked();
  const auth = useSession();
  const signed = !!linked && auth.address?.toLowerCase() === linked.address.toLowerCase();
  const [open, setOpen] = useState(false);
  // where the menu opens: under the button, measured at the click, drawn above the whole page
  const [at, setAt] = useState({ top: 72, right: 16 });
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node))
        setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const z = pageZoom();
          setAt({ top: (r.bottom + 10) / z, right: Math.max(8, (window.innerWidth - r.right) / z) });
          setOpen((o) => !o);
        }}
        className={cx(
          "flex h-9 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-colors",
          linked || auth.google
            ? "border border-[#242424] bg-[#181818] text-text"
            : "bg-ui text-[#0b0b0b] hover:bg-[#5ff09d]",
        )}
      >
        {linked ? (
          <>
            <span aria-hidden className="led" data-tone="on" />
            <span className="normal-case tracking-normal">{short(linked.address)}</span>
            {linked.via === "watch" && <span className="text-[12px] text-muted">watch</span>}
            {signed && <span className="text-[12px] text-leaf">signed in</span>}
          </>
        ) : auth.google ? (
          <>
            <span aria-hidden className="led" data-tone="on" />
            <span className="normal-case tracking-normal">Google</span>
            <span className="text-[12px] text-leaf">signed in</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>

      {open &&
        createPortal(
          <>
            <div
              aria-hidden
              className="wallet-dim fixed inset-0 z-[90] bg-[#020403]/60 backdrop-blur-[2px]"
            />
            {/* the outer box places the menu; .inst sets its own position, so it cannot carry `fixed` */}
            <div ref={pop} className="wallet-pop fixed z-[91]" style={{ top: at.top, right: at.right }}>
              <div
                role="dialog"
                aria-label="Wallet"
                className="inst w-[min(23rem,calc(100vw-1rem))] border-leaf/50 bg-[#101010] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.95),0_0_0_1px_rgba(111,231,168,0.25)]"
              >
                <span aria-hidden className="inst-sq tl" />
                <span aria-hidden className="inst-sq br" />
                <div className="inst-head">
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] text-leaf" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 11-3v3M15 12.5h5v3h-5a1.5 1.5 0 0 1 0-3Z" />
                  </svg>
                  <span className="inst-title">{linked ? "Your wallet" : auth.google ? "Your account" : "Sign in"}</span>
                </div>
                {linked ? (
                  <div className="p-4">
                    <p className="break-all font-mono text-xs text-text">{linked.address}</p>
                    <p className="mt-2 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">
                      {linked.via === "wallet"
                        ? signed
                          ? `Signed in with ${linked.name ?? "wallet"}`
                          : `From ${linked.name ?? "wallet"} · not signed in`
                        : "Watched address · sign-in needs a wallet"}
                    </p>
                    {linked.via === "wallet" && <SignInRow address={linked.address} rdns={linked.rdns} />}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href="/app/portfolio" onClick={() => setOpen(false)} className="ibtn h-9 px-4">
                        Portfolio
                      </Link>
                      <button
                        type="button"
                        className="ibtn-ghost h-9"
                        onClick={() => void navigator.clipboard?.writeText(linked.address)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="ibtn-ghost h-9"
                        onClick={() => {
                          if (signed) void auth.signOut();
                          unlink();
                          setOpen(false);
                        }}
                      >
                        Forget
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {auth.google && (
                      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                        <span className="text-[13px] text-text">Signed in with Google</span>
                        <button type="button" className="ibtn-ghost h-8" onClick={() => void auth.signOut().then(() => setOpen(false))}>
                          Sign out
                        </button>
                      </div>
                    )}
                    <LinkPanel onDone={() => setOpen(false)} />
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/** Popular wallets: our own copy of each mark, how the wallet announces itself (EIP-6963 rdns), where to get it. */
const KNOWN_WALLETS = [
  { name: "MetaMask", icon: "/wallets/metaMaskWallet.svg", rdns: ["io.metamask"], url: "https://metamask.io/download/" },
  { name: "Rabby", icon: "/wallets/rabbyWallet.svg", rdns: ["io.rabby"], url: "https://rabby.io" },
  { name: "Phantom", icon: "/wallets/phantomWallet.svg", rdns: ["app.phantom"], url: "https://phantom.com/download" },
  { name: "Coinbase Wallet", icon: "/wallets/coinbaseWallet.svg", rdns: ["com.coinbase.wallet"], url: "https://www.coinbase.com/wallet/downloads" },
  { name: "OKX Wallet", icon: "/wallets/okxWallet.svg", rdns: ["com.okex.wallet"], url: "https://www.okx.com/web3" },
  { name: "Rainbow", icon: "/wallets/rainbowWallet.svg", rdns: ["me.rainbow"], url: "https://rainbow.me/download" },
  { name: "Trust Wallet", icon: "/wallets/trustWallet.svg", rdns: ["com.trustwallet.app"], url: "https://trustwallet.com/download" },
  { name: "Zerion", icon: "/wallets/zerionWallet.svg", rdns: ["io.zerion.wallet"], url: "https://zerion.io/download" },
  { name: "Backpack", icon: "/wallets/backpackWallet.svg", rdns: ["app.backpack"], url: "https://backpack.app/download" },
];
const knownOf = (rdns?: string) => KNOWN_WALLETS.find((k) => !!rdns && k.rdns.some((r) => rdns.startsWith(r)));

function WalletMark({ src, name }: { src?: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- our own small static marks, or the extension's data: icon
    <img src={src} alt="" width={30} height={30} className="size-[30px] shrink-0 rounded-lg" />
  ) : (
    <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[#232323] font-mono text-[13px] text-leaf">{name.slice(0, 1)}</span>
  );
}

/** Connect a wallet: the ones in this browser first, then the popular ones to install, then watching any address. */
/** Sign-in with Google: a plain link to Google's own page, then back to where you were. */
export function GoogleButton({ className }: { className?: string }) {
  const back = typeof location === "undefined" ? "/app/overview" : location.pathname + location.search;
  return (
    <a href={`/api/auth/google?back=${encodeURIComponent(back)}`} className={cx("flex h-11 items-center justify-center gap-2.5 rounded-xl border border-[#2a2a2a] px-4 text-[14px] font-medium text-text transition-colors hover:border-[#4a4a4a] hover:bg-[#151515]", className)}>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function LinkPanel({ onDone, google = true }: { onDone?: () => void; google?: boolean }) {
  const auth = useSession();
  const { link } = useLinked();
  const wallets = useWallets();
  const [err, setErr] = useState<string | null>(null);
  const [watch, setWatch] = useState("");
  const connect = useCallback(
    async (w: Announced | null) => {
      setErr(null);
      const provider = w?.provider ?? (window as unknown as { ethereum?: Provider }).ethereum;
      if (!provider) return setErr("No wallet found in this browser.");
      try {
        const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
        if (!accounts?.[0]) return setErr("The wallet returned no address.");
        link({ address: accounts[0], via: "wallet", name: w?.info.name, rdns: w?.info.rdns });
        onDone?.();
      } catch {
        setErr("The wallet refused the request.");
      }
    },
    [link, onDone],
  );
  const installed = new Set(wallets.map((w) => knownOf(w.info.rdns)?.name).filter(Boolean));
  const others = KNOWN_WALLETS.filter((k) => !installed.has(k.name));

  return (
    <div>
      {google && auth.googleOn && !auth.google && (
        <div className="px-4 pt-3">
          <GoogleButton />
          <p className="mt-3 flex items-center gap-3 text-[12px] uppercase tracking-[0.08em] text-muted"><span className="h-px flex-1 bg-line" />or a wallet<span className="h-px flex-1 bg-line" /></p>
        </div>
      )}
      {wallets.length > 0 && <p className="px-4 pb-1 pt-3 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">In this browser</p>}
      <ul>
        {wallets.map((w) => {
          const k = knownOf(w.info.rdns);
          return (
            <li key={w.info.uuid}>
              <button type="button" onClick={() => void connect(w)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-leaf/[0.06]">
                <WalletMark src={k?.icon ?? (w.info.icon?.startsWith("data:image/") ? w.info.icon : null)} name={w.info.name} />
                <span className="text-[15px] font-medium text-text">{w.info.name}</span>
                <span className="ml-auto rounded-lg bg-ui px-3 py-1 text-[12.5px] font-semibold text-[#0b0b0b]">Connect</span>
              </button>
            </li>
          );
        })}
        {wallets.length === 0 && (
          <li>
            <button type="button" onClick={() => void connect(null)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-leaf/[0.06]">
              <WalletMark name="Browser wallet" />
              <span className="text-[15px] font-medium text-text">Browser wallet</span>
              <span className="ml-auto rounded-lg bg-ui px-3 py-1 text-[12.5px] font-semibold text-[#0b0b0b]">Connect</span>
            </button>
          </li>
        )}
      </ul>
      <p className="border-t border-line px-4 pb-1 pt-3 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">Popular wallets</p>
      <ul className="grid grid-cols-3 gap-1 px-3 pb-3">
        {others.map((k) => (
          <li key={k.name}>
            <a href={k.url} target="_blank" rel="noreferrer" title={`Get ${k.name}`} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors hover:bg-leaf/[0.06]">
              <WalletMark src={k.icon} name={k.name} />
              <span className="truncate text-[12px] text-muted">{k.name}</span>
            </a>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const a = watch.trim();
          if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setErr("Paste a full 0x address to watch it.");
          link({ address: a, via: "watch" });
          onDone?.();
        }}
      >
        <input value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="Or watch any address 0x…" spellCheck={false} aria-label="Address to watch" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-[#090909] px-3 font-mono text-[12px] text-text outline-none focus:border-ui/60" />
        <button type="submit" className="h-9 rounded-lg border border-line px-3 text-[12.5px] text-text hover:border-ui/60">
          Watch
        </button>
      </form>
      <p className="border-t border-line px-4 py-3 text-xs text-muted">Corbel only reads your address. Signing in asks for one message, never a transaction.</p>
      {err && <p className="border-t border-line bg-flesh-deep/50 px-4 py-3 text-sm text-text">{err}</p>}
    </div>
  );
}

/** Sign in / out for a wallet-linked address. One message signature, no transaction. */
export function SignInRow({ address, rdns }: { address: string; rdns?: string }) {
  const auth = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signed = auth.address?.toLowerCase() === address.toLowerCase();
  return (
    <div className="mt-3">
      {signed ? (
        <button type="button" className="ibtn-ghost h-9" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          className="ibtn h-9 px-4 disabled:opacity-60"
          onClick={async () => {
            setBusy(true);
            setErr(await auth.signIn(address, rdns));
            setBusy(false);
          }}
        >
          {busy ? "Check your wallet…" : "Sign in"}
        </button>
      )}
      {err && <p className="mt-2 text-xs text-flesh">{err}</p>}
    </div>
  );
}
