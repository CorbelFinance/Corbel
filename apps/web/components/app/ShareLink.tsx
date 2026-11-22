"use client";

/**
 * Wallet · Share. Show what a wallet holds without showing which wallet it is: a signed read-only link that expires
 * in 1 hour, 1 day or 7 days. Whoever opens it sees the holdings and the total, read at the moment they open it,
 * but never the address: the server reads the wallet and leaves the address out of the answer.
 *
 * Laid out so the point is clear at a glance: what it is for (three everyday uses), three steps on the left (pick
 * the wallet, pick the expiry, make the link), and on the right the viewer's page itself, previewed from the real
 * holdings of the picked wallet. Under it, what the viewer sees and what they never see.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Bay, SubTabs } from "./Bay";
import { WalletPick } from "./WalletPick";
import { TryWallets } from "./WalletIdle";
import { TokenAvatar } from "./TokenAvatar";
import { linesOf, usd, usePortfolio } from "./walletData";

const HOURS = [
  { id: "1", label: "1 hour" },
  { id: "24", label: "1 day" },
  { id: "168", label: "7 days" },
] as const;
const USES = [
  ["Show a friend", "what you hold, without handing over an address they could follow forever"],
  ["Prove a balance", "to a group or a seller, for a day, then the link dies"],
  ["Check from your phone", "without pasting your address into another device"],
];

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="relative pl-10">
      <span className={cx("absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full border font-mono text-[12px]", done ? "border-leaf bg-leaf/15 text-leaf" : "border-line text-muted")}>{done ? "✓" : n}</span>
      <p className="pt-0.5 text-[13.5px] font-semibold text-text">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** The page the viewer gets, drawn from the picked wallet's real holdings, the address left out. */
function Viewer({ addr, hours }: { addr: string | null; hours: number }) {
  const { p, busy, err } = usePortfolio(addr ? `/api/portfolio?address=${addr}` : null);
  const { lines, total } = p ? linesOf(p) : { lines: [], total: 0 };
  const [left, setLeft] = useState(hours * 3600);
  useEffect(() => {
    const f = setTimeout(() => setLeft(hours * 3600), 0);
    const i = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => (clearTimeout(f), clearInterval(i));
  }, [hours]);
  const pad = (v: number) => String(v).padStart(2, "0");
  const clock = left >= 86_400 ? `${Math.floor(left / 86_400)}d ${pad(Math.floor((left % 86_400) / 3600))}h` : `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-(--bay-edge) bg-[#080b10] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-1.5 border-b border-(--bay-edge) px-3 py-2">
        <i className="h-2 w-2 rounded-full bg-[#2a2f3a]" />
        <i className="h-2 w-2 rounded-full bg-[#2a2f3a]" />
        <i className="h-2 w-2 rounded-full bg-[#2a2f3a]" />
        <span className="ml-2 truncate rounded-md bg-[#11151d] px-2 py-0.5 font-mono text-[12px] text-muted">corbel · shared view</span>
      </div>
      <div className="p-4">
        <p className="flex items-center justify-between font-mono text-[12px] text-muted">
          <span className="rounded-full border border-(--bay-edge) px-2 py-0.5">address hidden</span>
          <span>{`expires in ${clock}`}</span>
        </p>
        <p className="mt-3 text-[12px] text-muted">Total held</p>
        <p className="font-display text-[30px] leading-none tabular-nums text-text">{p ? usd(total) : addr ? (busy ? "···" : "—") : "$ ···"}</p>
        <ul className="mt-4 space-y-2">
          {!addr &&
            [70, 48, 30].map((w, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <i className="h-6 w-6 rounded-full bg-[#141923]" />
                <i className="h-2 rounded-full bg-[#1a202b]" style={{ width: `${w}%` }} />
              </li>
            ))}
          {addr && busy && <li className="caret font-mono text-[12px] text-muted">Reading the holdings</li>}
          {addr && err && <li className="text-[12px] text-flesh">{err}</li>}
          {lines.slice(0, 5).map((l) => (
            <li key={l.token} className="flex items-center gap-2.5 text-[12.5px]">
              <TokenAvatar address={l.token} symbol={l.symbol} stock={l.kind === "stock"} size={22} />
              <span className="font-mono text-text">{l.symbol}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-[#141923]">
                <span className="block h-full rounded-full bg-[#93a6ff]" style={{ width: `${total ? (l.usd / total) * 100 : 0}%` }} />
              </span>
              <span className="w-16 text-right tabular-nums text-[#cfd8ff]">{usd(l.usd)}</span>
            </li>
          ))}
          {p && lines.length > 5 && <li className="font-mono text-[12px] text-muted">{`and ${lines.length - 5} more`}</li>}
          {p && !lines.length && <li className="text-[12px] text-muted">This wallet holds nothing right now.</li>}
        </ul>
      </div>
    </div>
  );
}

export function ShareLink() {
  const [addr, setAddr] = useState<string | null>(null);
  const [h, setH] = useState<(typeof HOURS)[number]["id"]>("24");
  const [link, setLink] = useState<{ url: string; exp: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pick = useCallback((a: string) => (setAddr(a), setLink(null)), []);

  const make = async () => {
    if (!addr) return;
    setBusy(true);
    setErr(null);
    try {
      const j = (await fetch(`/api/share?address=${addr}&hours=${h}`).then((r) => r.json())) as { t?: string; exp?: number; error?: string };
      if (!j.t || !j.exp) return setErr(j.error ?? "Could not make the link.");
      setLink({ url: `${window.location.origin}/app/s/${j.t}`, exp: j.exp });
    } catch {
      setErr("No answer. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Bay tone="ink" kicker="Show what you hold, not who you are" title="Share link" busy={busy} foot={<span>The link is signed: nobody can change the address inside it or stretch the expiry. Anyone with the link can view until it expires.</span>}>
      {/* what it is for */}
      <div className="grid gap-px border-y border-(--bay-edge) bg-(--bay-edge) sm:grid-cols-3">
        {USES.map(([k, v]) => (
          <div key={k} className="bg-[color-mix(in_srgb,var(--bay-bg2)_50%,#0b0e14)] px-5 py-3.5">
            <p className="text-[13px] text-text">{k}</p>
            <p className="mt-0.5 text-[12px] text-muted">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* the three steps */}
        <div className="space-y-6 px-5 py-6">
          <Step n={1} title="Pick the wallet" done={!!addr}>
            <div className="-mx-5">
              <WalletPick onPick={pick} busy={busy} cta="Use this wallet" />
            </div>
            {!addr && (
              <div className="-mx-5">
                <TryWallets onPick={pick} />
              </div>
            )}
          </Step>
          <Step n={2} title="Pick how long it works" done={!!addr}>
            <SubTabs label="Expires after" value={h} onChange={(v) => (setH(v), setLink(null))} tabs={HOURS} />
          </Step>
          <Step n={3} title="Make the link and send it" done={!!link}>
            {!link ? (
              <>
                <button type="button" disabled={!addr || busy} onClick={() => void make()} className="bay-btn w-full">
                  {busy ? "Signing the link…" : addr ? "Make the link" : "Pick a wallet first"}
                </button>
                {err && <p className="mt-2 text-[12px] text-flesh">{err}</p>}
              </>
            ) : (
              <div className="pane-in space-y-2">
                <p className="break-all rounded-xl border border-(--bay-edge) bg-[#070910] p-3 font-mono text-[12px] text-[#cfd8ff]">{link.url}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1400)))} className={cx("bay-btn flex-1", copied && "bg-leaf!")}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <a href={link.url} target="_blank" rel="noreferrer" className="bay-ghost h-10.5 px-4">
                    Open ↗
                  </a>
                  <button type="button" onClick={() => setLink(null)} className="bay-ghost h-10.5 px-4">
                    New
                  </button>
                </div>
                <p className="font-mono text-[12px] text-muted">{`Works until ${new Date(link.exp * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`}</p>
              </div>
            )}
          </Step>
        </div>

        {/* what the viewer gets */}
        <div className="border-t border-(--bay-edge) bg-[color-mix(in_srgb,var(--bay-bg2)_60%,transparent)] px-5 py-6 lg:border-l lg:border-t-0">
          <p className="mb-4 text-center text-[12px] text-muted">{addr ? "This is the page the person with the link opens" : "The page the person with the link opens"}</p>
          <Viewer addr={addr} hours={Number(h)} />
          <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3 text-[12px]">
            <div>
              <p className="text-leaf">They see</p>
              <ul className="mt-1.5 space-y-1 text-[#c9d6cf]">
                <li>✓ each holding and its value</li>
                <li>✓ the total, read when they open it</li>
                <li>✓ when the link expires</li>
              </ul>
            </div>
            <div>
              <p className="text-flesh">They never see</p>
              <ul className="mt-1.5 space-y-1 text-[#c9d6cf]">
                <li>✕ the address</li>
                <li>✕ its swaps and history</li>
                <li>✕ anything that links back to you</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Bay>
  );
}
