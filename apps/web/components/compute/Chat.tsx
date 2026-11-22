"use client";
import { AI_ACCESS } from "@corbel/config";

import Link from "next/link";

/**
 * Compute · Chat. Talk to any model we run, on a stage with a living ASCII orb: big and turning slowly while the
 * chat is empty, small in the corner once you talk, spinning up and pulsing while a model writes. Conversations live
 * in this browser only (localStorage); the server passes each message to the model and back without keeping it.
 * Reading is open to everyone; sending needs a wallet sign-in and has a daily limit.
 * Modes: Text (any model we run), Image and Video (a model, a shape, a quality and for film a length, each its own
 * chip; the result is drawn into the chat from /api/media, streamed through this site), Audio (soon).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { useSession } from "../app/session";
import { LinkPanel, useLinked } from "../app/wallet";
import { AsciiOrb, type OrbHandle } from "./AsciiOrb";
import { Monogram, ctxK, makerName, money } from "./data";

type ChatModel = { id: string; name: string; maker: string; ctx: number; kind: string; pin: number; pout: number; top?: boolean };
type Msg = { role: "user" | "assistant"; content: string; err?: boolean; media?: { id: string; kind: "image" | "video" | "audio"; model: string; prompt: string; seconds: number; at: number; url?: string; type?: string } };
type Conv = { id: string; model: string; title: string; at: number; msgs: Msg[]; mode?: Mode };
const KEY = "corbel.chats";
const STARTERS = [
  "What should I check before buying a token that launched an hour ago?",
  "Explain a Uniswap v4 hook to a trader, in plain words.",
  "Write a Solidity ERC-20 with a fixed supply and no owner functions.",
  "Draft a short, honest launch post. No hype words.",
];

function loadConvs(): Conv[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Conv[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveConvs(c: Conv[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c.slice(0, 40)));
  } catch {
    /* storage off: the chat still works for this page */
  }
}
const newId = () => Math.random().toString(36).slice(2, 10);
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Plain text with fenced code blocks, inline code and bold; nothing is rendered as HTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/```/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          const nl = p.indexOf("\n");
          return <Code key={i} lang={nl > 0 ? p.slice(0, nl).trim() : ""} code={(nl > 0 ? p.slice(nl + 1) : p).replace(/\n$/, "")} />;
        }
        return p
          .split(/\n{2,}/)
          .filter((x) => x.trim())
          .map((para, j) => (
            <p key={`${i}-${j}`} className="mb-3 whitespace-pre-wrap last:mb-0">
              {para.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((s, k) =>
                s.startsWith("`") && s.endsWith("`") && s.length > 2 ? (
                  <code key={k} className="rounded bg-[#2a1b13] px-1 py-0.5 font-mono text-[0.9em] text-[#ffcfae]">
                    {s.slice(1, -1)}
                  </code>
                ) : s.startsWith("**") && s.endsWith("**") && s.length > 4 ? (
                  <strong key={k} className="font-semibold text-text">
                    {s.slice(2, -2)}
                  </strong>
                ) : (
                  s
                ),
              )}
            </p>
          ));
      })}
    </>
  );
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#3a2418] bg-[#0b0706]">
      <div className="flex items-center justify-between border-b border-[#2e1f17] px-3 py-1.5 font-mono text-[12px] text-muted">
        <span>{lang || "code"}</span>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(code).then(() => (setOk(true), setTimeout(() => setOk(false), 1200)))} className="hover:text-text">
          {ok ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-[#f1e2d6]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ModelPick({ list, value, onChange, canTop }: { list: ChatModel[]; value: string; onChange: (id: string) => void; canTop: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [open]);
  const cur = list.find((m) => m.id === value);
  const s = q.trim().toLowerCase();
  const shown = list.filter((m) => !s || m.name.toLowerCase().includes(s) || makerName(m.maker).toLowerCase().includes(s));
  const makers = [...new Set(shown.filter((m) => !m.top).map((m) => m.maker))];
  const topShown = shown.filter((m) => m.top);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={cx("chat-glass flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-left transition-colors", open ? "border-[#ff9a5c]" : "hover:border-[#6b4228]")}>
        {cur && <Monogram maker={cur.maker} size={30} />}
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate text-[13.5px] font-semibold text-text">{cur?.name ?? "Pick a model"}</span>
          <span className="block truncate text-[12px] text-muted">{cur ? (cur.top ? `${makerName(cur.maker)} · top holders` : `${makerName(cur.maker)} · ${ctxK(cur.ctx)}`) : `${list.length} available`}</span>
        </span>
        <svg aria-hidden viewBox="0 0 12 12" className={cx("ml-1 h-3 w-3 text-muted transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className="pick-list absolute left-0 top-full z-50 mt-2 w-[min(26rem,90vw)] overflow-hidden rounded-2xl border border-[#3a2418] bg-[#0d0806]" style={{ ["--bay-acc" as string]: "#ff9a5c" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a model or a maker" aria-label="Find a model" className="h-11 w-full border-b border-[#2e1f17] bg-transparent px-4 text-[13px] text-text outline-none placeholder:text-muted" />
          <ul role="listbox" aria-label="Models" className="max-h-80 overflow-y-auto p-1.5">
            {makers.map((mk) => (
              <li key={mk}>
                <p className="px-2 pb-1 pt-2 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">{makerName(mk)}</p>
                <ul>
                  {shown
                    .filter((m) => m.maker === mk)
                    .map((m) => (
                      <li key={m.id} role="option" aria-selected={m.id === value} onClick={() => (onChange(m.id), setOpen(false), setQ(""))} className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[#ff9a5c]/10", m.id === value && "bg-[#ff9a5c]/10")}>
                        <Monogram maker={m.maker} size={22} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text">{m.name}</span>
                        <span className="shrink-0 font-mono text-[12px] text-muted">{`${money(m.pin)} / ${money(m.pout)}`}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
            {topShown.length > 0 && (
              <li>
                <p className="mt-1 border-t border-[#2e1f17] px-2 pb-1 pt-2 font-medium text-[12px] uppercase tracking-[0.08em] text-[#ff9a5c]">{canTop ? "Every model · top holder" : "Every model · Full holders"}</p>
                <ul>
                  {topShown.map((m) => (
                    <li key={m.id} role="option" aria-selected={m.id === value} aria-disabled={!canTop} onClick={() => canTop && (onChange(m.id), setOpen(false), setQ(""))} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors", canTop ? "cursor-pointer hover:bg-[#ff9a5c]/10" : "cursor-default opacity-55", m.id === value && "bg-[#ff9a5c]/10")}>
                      <Monogram maker={m.maker} size={22} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{m.name}</span>
                      <span className="shrink-0 font-mono text-[12px] text-muted">{canTop ? makerName(m.maker) : "Top holders"}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {!shown.length && <li className="px-3 py-6 text-center text-[12.5px] text-muted">No model by that name.</li>}
            <li className="border-t border-[#2e1f17] px-3 py-2.5 text-[12px] text-muted"><span className="text-[#ff9a5c]">185 models</span> for Full holders ({AI_ACCESS.tiers.at(-1)!.minCoins.toLocaleString("en-US")} $CORBEL): text, pictures, video, voice and music in one chat.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/** Where the composer would be when the visitor cannot send yet: connect a wallet, then sign one message. */
function Unlock({ limit }: { limit: number }) {
  const auth = useSession();
  const { linked } = useLinked();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="chat-glass relative flex flex-wrap items-center gap-3 rounded-[22px] p-3 pl-5">
      <span className="min-w-0 flex-1 text-[13.5px] text-[#e9d6c8]">{linked?.via === "wallet" ? "One signature and you can write: a message, not a transaction." : `Connect a wallet to write. ${limit} messages a day, free while payments are not open.`}</span>
      {linked?.via === "wallet" ? (
        <button type="button" onClick={() => void auth.signIn(linked.address, linked.rdns).then(setErr)} className="h-11 rounded-full bg-[#ff9a5c] px-6 text-[14px] font-semibold text-[#1a0d06] hover:bg-[#ffb07e]">
          Sign in to chat
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-11 rounded-full bg-[#ff9a5c] px-6 text-[14px] font-semibold text-[#1a0d06] hover:bg-[#ffb07e]">
          Connect wallet
        </button>
      )}
      {open && !linked && (
        <div className="absolute bottom-full right-0 z-40 mb-2 w-[min(22rem,90vw)] overflow-hidden rounded-2xl border border-[#3a2418] bg-[#0d0806] shadow-[0_24px_60px_-16px_rgba(0,0,0,.9)]">
          <LinkPanel onDone={() => setOpen(false)} google={false} />
        </div>
      )}
      {err && <p className="w-full text-[12.5px] text-flesh">{err}</p>}
    </div>
  );
}


/* ───────────── pictures, film and sound ───────────── */
type MediaOpt = { id: string; label: string; values: (string | number)[]; default: string | number; unit?: string };
type MediaM = { id: string; kind: "image" | "video" | "audio"; label: string; maker: string; line: string; seconds: number; options: MediaOpt[]; top?: boolean; needs?: "image" | "video" | null; tool?: boolean };
type MediaInfo = { open: boolean; signedIn: boolean; top?: boolean; limits: Record<string, number>; left: Record<string, number> | null; models: MediaM[] };
type Mode = "text" | "image" | "video" | "audio";
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "text", label: "Text", icon: "M3 4h10M3 8h10M3 12h6" },
  { id: "image", label: "Image", icon: "M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M10.5 6.2a.7.7 0 1 0 0-.01" },
  { id: "video", label: "Video", icon: "M2.5 4h8v8h-8zM10.5 7l3-2v6l-3-2" },
  { id: "audio", label: "Audio", icon: "M3 6v4M6 4v8M9 2.5v11M12 5.5v5" },
];
const MEDIA_STARTERS: Record<string, string[]> = {
  image: ["A green leaf on black glass, studio light", "A tiny robot trading at a neon desk, isometric", "The Corbel logo carved in jade, macro photo"],
  audio: ["Corbel checks the token before you buy.", "Welcome back. Here is the market this morning.", "Three, two, one. The pool is open."],
  video: ["A green leaf slowly falling through dark water", "Candles on a chart turning into a city skyline at night", "A slow drone shot over a misty pine forest at dawn"],
};

/** One option as a chip that opens its own list; never a native select. */
function OptChip({ o, value, onChange }: { o: MediaOpt; value: string | number; onChange: (v: string | number) => void }) {
  const [open, setOpen] = useState(false);
  const one = o.values.length < 2;
  return (
    <div className="relative">
      <button type="button" disabled={one} onClick={() => setOpen((x) => !x)} aria-expanded={open} className={cx("flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors", open ? "border-[#ff9a5c] text-text" : "border-[#3a2418] text-[#e9d6c8] hover:border-[#ff9a5c]/70", one && "cursor-default opacity-80")}>
        <span className="text-muted">{o.label}</span>
        <span className="font-medium">{`${value}${o.unit ?? ""}`}</span>
        {!one && (
          <span aria-hidden className="text-[10px] text-muted">
            ▾
          </span>
        )}
      </button>
      {open && (
        <ul role="listbox" className="absolute bottom-10 left-0 z-30 min-w-full overflow-hidden rounded-xl border border-[#3a2418] bg-[#140d0a] p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]">
          {o.values.map((v) => (
            <li key={String(v)}>
              <button type="button" role="option" aria-selected={v === value} onClick={() => (onChange(v), setOpen(false))} className={cx("flex w-full items-center justify-between gap-4 rounded-lg px-3 py-1.5 text-left text-[13px]", v === value ? "bg-[#2a1b13] text-[#ff9a5c]" : "text-text hover:bg-[#1f140f]")}>
                {`${v}${o.unit ?? ""}`}
                {o.id === "aspect_ratio" && <AspectIcon r={String(v)} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function AspectIcon({ r }: { r: string }) {
  const [a, b] = r.split(":").map(Number) as [number, number];
  const k = 12 / Math.max(a, b);
  return <span aria-hidden className="inline-block rounded-[2px] border border-current opacity-70" style={{ width: a * k, height: b * k }} />;
}

/** A picture or video on its way: the elapsed time against the usual time, then the file itself. */
function MediaCard({ m, onReady }: { m: NonNullable<Msg["media"]>; onReady: (url: string, type: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (m.url) return;
    let off = false;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const poll = async () => {
      while (!off) {
        await new Promise((r) => setTimeout(r, 2500));
        const j = (await fetch(`/api/media?id=${m.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}))) as { state?: string; url?: string; type?: string; error?: string };
        if (off) return;
        if (j.state === "done" && j.url) return onReady(j.url, j.type ?? m.kind);
        if (j.state === "failed" || j.error) return setErr(j.error ?? "It did not work. Try again.");
        if (Date.now() - m.at > Math.max(300, m.seconds * 5) * 1000) return setErr("This is taking far longer than usual. Try again.");
      }
    };
    void poll();
    return () => {
      off = true;
      clearInterval(tick);
    };
  }, [m.id, m.url, m.kind, onReady]);
  const el = Math.max(0, (now - m.at) / 1000);
  const p = Math.min(0.95, el / Math.max(1, m.seconds));
  if (err) return <p className="chat-glass rounded-[20px] px-4 py-3 text-[14px] text-flesh">{err}</p>;
  if (!m.url)
    return (
      <div className="chat-glass w-[26rem] max-w-full overflow-hidden rounded-[20px]">
        <div className={cx("media-wait relative grid place-items-center", m.kind === "video" ? "aspect-video" : m.kind === "audio" ? "h-28" : "aspect-square")}>
          <span className="font-display text-[34px] tabular-nums text-[#ff9a5c]">{`${Math.floor(el)} s`}</span>
        </div>
        <div className="px-4 py-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1c130e]">
            <span className="block h-full rounded-full bg-[#ff9a5c] transition-[width] duration-300" style={{ width: `${p * 100}%` }} />
          </div>
          <p className="mt-2 flex justify-between gap-3 text-[12px] text-muted">
            <span>{m.kind === "video" ? "Filming" : m.kind === "audio" ? "Speaking" : "Drawing"}</span>
            <span>{`usually about ${m.seconds} s`}</span>
          </p>
        </div>
      </div>
    );
  return (
    <figure className="chat-glass w-[30rem] max-w-full overflow-hidden rounded-[20px]">
      {m.type === "video" || m.kind === "video" ? (
        <video src={m.url} controls playsInline loop className="block w-full bg-black" />
      ) : m.kind === "audio" ? (
        <div className="px-4 pt-4">
          <p className="line-clamp-2 text-[13px] text-[#e9d6c8]">{m.prompt}</p>
          <audio src={m.url} controls className="mt-3 block w-full" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a generated file served by our own API
        <img src={m.url} alt={m.prompt} className="block w-full bg-black" />
      )}
      <figcaption className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] text-muted">
        <span className="truncate">{m.model}</span>
        <a href={m.url} download className="shrink-0 text-[#ff9a5c] hover:underline">
          Download
        </a>
      </figcaption>
    </figure>
  );
}

export function Chat() {
  const auth = useSession();
  const [info, setInfo] = useState<{ signedIn: boolean; top?: boolean; left: number | null; limit: number; guestLeft?: number | null; guestPerDay?: number; models: ChatModel[] } | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [minfo, setMinfo] = useState<MediaInfo | null>(null);
  const [mmodel, setMmodel] = useState<Record<string, string>>({});
  const [mopts, setMopts] = useState<Record<string, Record<string, string | number>>>({});
  const [mpick, setMpick] = useState(false);
  const [mfind, setMfind] = useState("");
  // the picture or video a model starts from: uploaded as soon as it is picked, sent by its id
  const [att, setAtt] = useState<{ id: string; name: string; kind: "image" | "video"; model: string } | null>(null);
  const [attBusy, setAttBusy] = useState<string | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch("/api/media", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: MediaInfo) => setMinfo(j))
      .catch(() => undefined);
  }, []);
  const mList = (minfo?.models ?? []).filter((x) => x.kind === mode);
  const mm = mList.find((x) => x.id === mmodel[mode]) ?? mList.find((x) => !x.top || minfo?.top) ?? null;
  const optOf = (o: MediaOpt) => mopts[mm?.id ?? ""]?.[o.id] ?? o.default;
  // a question typed elsewhere (?q=…) arrives in the box, ready to send
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) void Promise.resolve().then(() => setDraft(q.slice(0, 2000)));
  }, []);
  const [find, setFind] = useState("");
  // full screen: the chat covers the whole window; Esc or the button brings it back
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", k);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", k);
    };
  }, [full]);
  const [busy, setBusy] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const orb = useRef<OrbHandle | null>(null);
  const bindOrb = useCallback((h: OrbHandle) => void (orb.current = h), []);

  const loadInfo = useCallback(
    () =>
      fetch("/api/chat", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { signedIn: boolean; top?: boolean; left: number | null; limit: number; guestLeft?: number | null; guestPerDay?: number; models: ChatModel[] }) => {
          setInfo(j);
          setModel((m) => m || j.models[0]?.id || "");
          // a server that just started may not have its model list yet: ask again shortly
          if (!j.models.length) setTimeout(() => void loadInfo(), 6000);
        })
        .catch(() => setInfo({ signedIn: false, left: null, limit: 0, models: [] })),
    [],
  );
  useEffect(() => {
    void Promise.resolve().then(() => {
      setConvs(loadConvs());
      void loadInfo();
    });
  }, [loadInfo, auth.address]);

  const conv = convs.find((c) => c.id === cur) ?? null;
  const msgs = useMemo(() => conv?.msgs ?? [], [conv]);
  // scrollIntoView may return a promise in newer browsers; an effect must return nothing or a cleanup
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);
  useEffect(() => {
    orb.current?.busy(busy);
  }, [busy]);
  const put = (next: Conv[]) => {
    setConvs(next);
    saveConvs(next);
  };

  const send = async (text: string, prior?: Msg[]) => {
    const t = text.trim();
    if (!t || busy || !model) return;
    const id = conv?.id ?? newId();
    const base: Conv = conv ?? { id, model, title: t.slice(0, 60), at: Date.now(), msgs: [] };
    const history: Msg[] = [...(prior ?? base.msgs).filter((m) => !m.err), { role: "user", content: t }];
    let list = [{ ...base, model, at: Date.now(), msgs: [...history, { role: "assistant" as const, content: "" }] }, ...convs.filter((c) => c.id !== id)];
    put(list);
    setCur(id);
    setDraft("");
    if (ta.current) ta.current.style.height = "auto";
    setBusy(true);
    const ctrl = new AbortController();
    stop.current = ctrl;
    const write = (content: string, err = false) => {
      list = list.map((c) => (c.id === id ? { ...c, msgs: [...history, { role: "assistant", content, err }] } : c));
      setConvs(list);
    };
    let acc = "";
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, messages: history }), signal: ctrl.signal });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        write(j.error ?? "The model did not answer.", true);
      } else {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const c of chunks) {
            if (!c.startsWith("data: ")) continue;
            const ev = JSON.parse(c.slice(6)) as { t?: string; done?: boolean; left?: number; error?: string };
            if (ev.t) {
              acc += ev.t;
              write(acc);
              orb.current?.pulse();
            }
            if (ev.left !== undefined) setInfo((x) => (x ? (x.signedIn ? { ...x, left: ev.left! } : { ...x, guestLeft: ev.left! }) : x));
            if (ev.error) write(acc ? `${acc}\n\n${ev.error}` : ev.error, !acc);
          }
        }
      }
    } catch {
      write(acc || "Stopped.", !acc);
    } finally {
      setBusy(false);
      stop.current = null;
      saveConvs(list);
      ta.current?.focus();
    }
  };

  const attach = async (f: File) => {
    if (!mm?.needs) return;
    setAttBusy(`Uploading ${f.name}…`);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("model", mm.id);
    const r = await fetch("/api/media/upload", { method: "POST", body: fd }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { id?: string; kind?: "image" | "video"; error?: string };
    if (j.id && j.kind) {
      setAtt({ id: j.id, name: f.name, kind: j.kind, model: mm.id });
      setAttBusy(null);
    } else setAttBusy(j.error ?? "The file did not upload. Try again.");
  };
  const fileReady = !mm?.needs || (att && att.model === mm.id);
  const sendMedia = async (text: string) => {
    const t = text.trim() || (mm?.tool ? `${mm.label}: ${att?.name ?? "file"}` : "");
    if (!t || busy || !mm || !fileReady) return;
    const id = conv?.id ?? newId();
    const base: Conv = conv ?? { id, model: mm.id, title: t.slice(0, 60), at: Date.now(), msgs: [], mode };
    const options = Object.fromEntries(mm.options.map((o) => [o.id, optOf(o)]));
    setDraft("");
    setBusy(true);
    const r = await fetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: mm.id, prompt: mm.tool && !text.trim() ? "" : t, options, file: mm.needs ? att?.id : undefined }) }).catch(() => null);
    if (mm.needs) setAtt(null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { id?: string; seconds?: number; left?: Record<string, number>; error?: string };
    const msg: Msg = j.id
      ? { role: "assistant", content: "", media: { id: j.id, kind: mm.kind, model: mm.label, prompt: t, seconds: j.seconds ?? mm.seconds, at: Date.now() } }
      : { role: "assistant", content: j.error ?? "It did not work. Try again.", err: true };
    if (j.left) setMinfo((x) => (x ? { ...x, left: j.left! } : x));
    const next = [{ ...base, model: mm.id, mode, at: Date.now(), msgs: [...base.msgs, { role: "user" as const, content: t }, msg] }, ...convs.filter((c) => c.id !== id)];
    put(next);
    setCur(id);
    setBusy(false);
  };
  const mediaReady = useCallback((convId: string, mediaId: string, url: string, type: string) => {
    setConvs((cs) => {
      const next = cs.map((c) => (c.id !== convId ? c : { ...c, msgs: c.msgs.map((x) => (x.media?.id === mediaId ? { ...x, media: { ...x.media, url, type } } : x)) }));
      saveConvs(next);
      return next;
    });
  }, []);

  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content, msgs.slice(0, msgs.lastIndexOf(lastUser)));
  };

  const cm = info?.models.find((m) => m.id === model);
  // the AI tools are for holders: a signed-in wallet
  const signedIn = !!auth.address;
  // without a wallet a visitor still gets a few short text messages a day, so the chat can be tried first
  const guestLeft = !signedIn ? (info?.guestLeft ?? 0) : 0;
  const canWrite = signedIn || (mode === "text" && guestLeft > 0);
  const empty = !msgs.length;
  const shownConvs = convs.filter((c) => !find.trim() || c.title.toLowerCase().includes(find.trim().toLowerCase()));

  return (
    <div className={cx("chat-stage ai-zone grid gap-3 overflow-hidden p-3 lg:grid-cols-[17rem_minmax(0,1fr)]", full ? "fixed left-0 top-0 z-[90] h-[calc(100dvh/var(--vz))] w-[calc(100vw/var(--vz))] rounded-none" : "relative h-[calc(100dvh/var(--vz)-112px)] min-h-[34rem] rounded-[28px]")}>
      {/* the orb: part of the empty screen, then a presence in the corner once you talk */}
      {!empty && (
        <div aria-hidden className="pointer-events-none absolute right-6 top-16 hidden h-48 w-48 opacity-80 lg:block">
          <AsciiOrb handle={bindOrb} className="h-full w-full" />
        </div>
      )}

      <aside className="chat-glass relative z-10 flex min-h-0 flex-col rounded-[22px] p-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-[15px] font-semibold text-text">
            Corbel <span className="font-mono text-[12px] font-normal text-[#ff9a5c]">chat</span>
          </p>
          <button type="button" onClick={() => (setCur(null), ta.current?.focus())} className="flex h-9 items-center gap-1.5 rounded-full bg-[#ff9a5c] px-4 text-[13px] font-semibold text-[#1a0d06] hover:bg-[#ffb07e]">
            <span aria-hidden>+</span> New
          </button>
        </div>
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="mt-3 h-10 rounded-xl border border-[#2e1f17] bg-[#0b0706]/70 px-3 text-[13px] text-text outline-none placeholder:text-muted focus:border-[#ff9a5c]" />
        <ul className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {shownConvs.map((c) => {
            const m = info?.models.find((x) => x.id === c.model);
            return (
              <li key={c.id} className="group relative">
                <button type="button" onClick={() => (setCur(c.id), c.mode && c.mode !== "text" ? setMode(c.mode) : (setMode("text"), setModel(c.model)))} className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 pr-8 text-left transition-colors", c.id === cur ? "bg-[#2a1b13]" : "hover:bg-[#1a110d]")}>
                  <Monogram maker={m?.maker ?? c.model.split("/")[0]!} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{c.title}</span>
                    <span className="block font-mono text-[12px] text-muted">{`${c.msgs.length} msg · ${hhmm(c.at)}`}</span>
                  </span>
                </button>
                <button type="button" aria-label={`Delete ${c.title}`} onClick={() => (put(convs.filter((x) => x.id !== c.id)), cur === c.id && setCur(null))} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 text-[14px] text-muted hover:text-flesh group-hover:block">
                  ×
                </button>
              </li>
            );
          })}
          {!shownConvs.length && <li className="px-2 py-4 text-[12px] text-muted">{convs.length ? "Nothing matches." : "Your chats show up here."}</li>}
        </ul>
        {/* the other AI sections, in order, in the chat's own column */}
        <nav aria-label="AI sections" className="mt-2 border-t border-[#2e1f17] pt-2">
          {[
            { href: "/app/ai/studio", label: "Studio", line: "Pick a task" },
            { href: "/app/ai/models", label: "Models", line: "Compare providers" },
            { href: "/app/ai/gpus", label: "GPUs", line: "Rent by the second" },
            { href: "/app/ai/credits", label: "Credits", line: "Soon" },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="group flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-[#ff9a5c]/10">
              <span>
                <span className="block text-[13px] text-text">{x.label}</span>
                <span className="block text-[12px] text-muted">{x.line}</span>
              </span>
              <span aria-hidden className="text-[#ff9a5c] transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          ))}
        </nav>
        <p className="mt-2 px-1 font-mono text-[12px] text-muted">Chats are saved in this browser only.</p>
      </aside>

      <section className="relative z-10 flex min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="What to make" className="chat-glass flex rounded-full p-1">
            {MODES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={mode === x.id}
                onClick={() => (setMode(x.id), setCur(null), setMpick(false))}
                className={cx("flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors", mode === x.id ? "bg-[#ff9a5c] font-semibold text-[#1a0d06]" : "text-[#e9d6c8] hover:text-text")}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={x.icon} />
                </svg>
                {x.label}
              </button>
            ))}
          </div>
          {mode === "text" && info && info.models.length > 0 && <ModelPick list={info.models} value={model} onChange={setModel} canTop={!!info.top} />}
          {(mode === "image" || mode === "video") && mm && (
            <div className="relative">
              <button type="button" onClick={() => setMpick((v) => !v)} aria-expanded={mpick} className="chat-glass flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3 text-[13px] text-text hover:border-[#ff9a5c]/70">
                <Monogram maker={mm.maker} size={24} />
                {mm.label}
                <span aria-hidden className="text-[10px] text-muted">
                  ▾
                </span>
              </button>
              {mpick && (
                <ul className="absolute left-0 top-11 z-30 max-h-[26rem] w-[24rem] overflow-y-auto rounded-2xl border border-[#3a2418] bg-[#140d0a] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]">
                  {mList.length > 8 && (
                    <li className="sticky top-0 z-10 bg-[#140d0a] p-1">
                      <input value={mfind} onChange={(e) => setMfind(e.target.value)} placeholder={`Search ${mList.length} models`} className="w-full rounded-lg border border-[#3a2418] bg-[#0f0a08] px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted" />
                    </li>
                  )}
                  {mList
                    .filter((x) => !mfind.trim() || `${x.label} ${x.maker}`.toLowerCase().includes(mfind.trim().toLowerCase()))
                    .map((x, i, arr) => {
                      const locked = !!x.top && !minfo?.top;
                      return (
                        <li key={x.id}>
                          {x.top && !arr[i - 1]?.top && <p className="mt-1 border-t border-[#2e1f17] px-2.5 pb-1 pt-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[#ff9a5c]">{minfo?.top ? "Every model · top holder" : "Every model · Full holders"}</p>}
                          <button type="button" disabled={locked} onClick={() => (setMmodel((s) => ({ ...s, [mode]: x.id })), setMpick(false), setMfind(""))} className={cx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", x.id === mm.id ? "bg-[#2a1b13]" : "hover:bg-[#1f140f]", locked && "cursor-default opacity-55 hover:bg-transparent")}>
                            <Monogram maker={x.maker} size={28} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] text-text">{x.label}</span>
                              <span className="block truncate text-[12px] text-muted">{x.line}</span>
                            </span>
                            <span className="shrink-0 text-[12px] text-muted">{locked ? "Top holders" : `~${x.seconds} s`}</span>
                          </button>
                        </li>
                      );
                    })}
                  <li className="border-t border-[#2e1f17] px-3 py-2.5 text-[12px] text-muted"><span className="text-[#ff9a5c]">185 models</span> for Full holders ({AI_ACCESS.tiers.at(-1)!.minCoins.toLocaleString("en-US")} $CORBEL): Veo, Sora, Kling, Runway, Flux and more, in full quality.</li>
                </ul>
              )}
            </div>
          )}
          <span className="chat-glass hidden rounded-full px-3 py-1.5 font-mono text-[12px] text-muted sm:inline">not stored · not logged</span>
          <button type="button" onClick={() => setFull((v) => !v)} aria-pressed={full} title={full ? "Exit full screen (Esc)" : "Full screen"} className="chat-glass order-last ml-auto grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:text-[#ff9a5c]">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              {full ? <path d="M6 1.5V6H1.5M10 1.5V6h4.5M6 14.5V10H1.5M10 14.5V10h4.5" /> : <path d="M1.5 6V1.5H6M14.5 6V1.5H10M1.5 10v4.5H6M14.5 10v4.5H10" />}
            </svg>
            <span className="sr-only">{full ? "Exit full screen" : "Full screen"}</span>
          </button>
          {signedIn && mode !== "text" && minfo?.left && (
            <span className="chat-glass ml-auto rounded-full px-3 py-1.5 text-[12.5px] text-muted">{`${minfo.left[mode] ?? 0} of ${minfo.limits[mode] ?? 0} today`}</span>
          )}
          {!signedIn && mode === "text" && info?.guestLeft != null && (
            <span className="chat-glass ml-auto rounded-full px-3 py-1.5 font-mono text-[12px] text-muted">{`${guestLeft} of ${info.guestPerDay ?? 0} free today · sign in for more`}</span>
          )}
          {signedIn && mode === "text" && info?.left != null && (
            <span className="chat-glass ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[12px] text-muted">
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#1c130e]">
                <span className="block h-full rounded-full bg-[#ff9a5c] transition-[width] duration-500" style={{ width: `${(info.left / Math.max(1, info.limit)) * 100}%` }} />
              </span>
              {`${info.left} of ${info.limit} today`}
            </span>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-1 py-6 sm:px-6">
          {!info ? (
            <p className="caret mt-[32vh] text-center font-mono text-[13px] text-muted">Reading the models</p>
          ) : !info.models.length ? (
            <div className="mt-[30vh] text-center">
              <h2 className="text-[20px] font-semibold text-text">Chat is not open right now</h2>
              <p className="mt-2 text-[13px] text-muted">The models are being connected. Try again in a little while.</p>
            </div>
          ) : empty && mode !== "text" ? (
            <div className="mx-auto max-w-2xl text-center">
              <div aria-hidden className="mx-auto h-[15rem] w-[min(22rem,100%)]">
                <AsciiOrb handle={bindOrb} className="h-full w-full" />
              </div>
              <p className="text-[13px] text-[#ff9a5c]">{mm ? `› ${mm.label}` : ""}</p>
              <h2 className="mt-2 font-display text-[44px] leading-[1] tracking-tight text-text sm:text-[56px]">{mode === "image" ? "Describe a picture." : mode === "audio" ? "Type what to say." : "Describe a scene."}</h2>
              <p className="mt-2 text-[15px] text-muted">{mode === "image" ? "Ready in about 15 to 25 seconds." : mode === "audio" ? "Spoken in about 10 seconds, up to 600 characters." : "Ready in one to three minutes."}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {(MEDIA_STARTERS[mode] ?? []).map((s, i) => (
                  <button key={s} type="button" disabled={!canWrite} onClick={() => setDraft(s)} className="chat-glass tile-in rounded-full px-4 py-2.5 text-left text-[13px] text-[#e9d6c8] transition-colors hover:border-[#ff9a5c]/70 disabled:cursor-default" style={{ animationDelay: `${i * 0.06}s` }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : empty ? (
            <div className="mx-auto max-w-2xl text-center">
              <div aria-hidden className="mx-auto h-[19rem] w-[min(26rem,100%)] sm:h-[23rem]">
                <AsciiOrb handle={bindOrb} className="h-full w-full" />
              </div>
              <p className="font-mono text-[12px] text-[#ff9a5c]">{`› ${cm ? `${makerName(cm.maker)} · ${cm.name}` : "any model"}`}</p>
              <h2 className="mt-2 font-display text-[44px] leading-[1] tracking-tight text-text sm:text-[60px]">Ask anything.</h2>
              <p className="mt-1 font-display text-[26px] leading-tight text-[#ff9a5c] sm:text-[34px]">Nothing you write is kept.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s, i) => (
                  <button key={s} type="button" disabled={!canWrite} onClick={() => void send(s)} className="chat-glass tile-in rounded-full px-4 py-2.5 text-left text-[13px] text-[#e9d6c8] transition-colors hover:border-[#ff9a5c]/70 disabled:cursor-default" style={{ animationDelay: `${i * 0.06}s` }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto max-w-3xl space-y-6 pr-0 sm:pr-40">
              {msgs.map((m, i) => (
                <li key={m.media?.id ?? i} className={cx("tile-in flex gap-3", m.role === "user" && "justify-end")}>
                  {m.role === "assistant" && <Monogram maker={cm?.maker ?? "x"} size={30} />}
                  <div className={cx("min-w-0 max-w-[85%] text-[14.5px] leading-relaxed", m.media ? "" : m.role === "user" ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-[#ff9a5c] to-[#e0793f] px-4 py-2.5 text-[#1a0d06]" : m.err ? "chat-glass rounded-[20px] px-4 py-3 text-flesh" : "chat-glass rounded-[20px] rounded-tl-md px-4 py-3 text-[#eadccf]")}>
                    {m.media ? (
                      <MediaCard m={m.media} onReady={(url, type) => mediaReady(conv!.id, m.media!.id, url, type)} />
                    ) : m.role === "assistant" && !m.content && busy ? (
                      <span className="chat-dots inline-flex gap-1 py-2" aria-label="Writing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <Rich text={m.content} />
                    )}
                    {m.role === "assistant" && m.content && !busy && i === msgs.length - 1 && (
                      <span className="mt-2 flex gap-3 border-t border-[#2e1f17] pt-2 text-[12px] text-muted">
                        <button type="button" onClick={() => void navigator.clipboard?.writeText(m.content)} className="hover:text-text">
                          Copy
                        </button>
                        <button type="button" onClick={retry} className="hover:text-text">
                          Ask again
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div ref={end} />
        </div>

        <div className="mx-auto w-full max-w-3xl">
          {info && info.models.length > 0 && !canWrite ? (
            <Unlock limit={info.limit} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void (mode === "text" ? send(draft) : sendMedia(draft));
              }}
              className="chat-glass rounded-[22px] p-2"
            >
              {mm?.needs && mode !== "text" && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  <input ref={fileIn} type="file" hidden accept={mm.needs === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileIn.current?.click()} className="chat-glass flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-[#e9d6c8] hover:border-[#ff9a5c]/70">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M10.5 4.5 5.4 9.6a1.6 1.6 0 0 0 2.3 2.3l5.4-5.4a3 3 0 0 0-4.3-4.3L3.4 7.6a4.4 4.4 0 0 0 6.2 6.2l4-4" /></svg>
                    {att && att.model === mm.id ? "Replace" : `Attach a ${mm.needs}`}
                  </button>
                  {att && att.model === mm.id ? (
                    <span className="flex items-center gap-2 rounded-full bg-[#2a1b13] px-3 py-1 text-[12.5px] text-text">
                      <span className="max-w-[16rem] truncate">{att.name}</span>
                      <button type="button" aria-label="Remove the file" onClick={() => setAtt(null)} className="text-muted hover:text-text">×</button>
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted">{attBusy ?? `${mm.label} starts from your ${mm.needs}${mm.tool ? "; words are optional" : ""}.`}</span>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={ta}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(220, e.target.scrollHeight)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void (mode === "text" ? send(draft) : sendMedia(draft));
                    }
                  }}
                  rows={1}
                  maxLength={mode === "audio" ? 600 : 12000}
                  placeholder={mode === "image" ? "A picture of…" : mode === "video" ? "A clip of…" : mode === "audio" ? "Words to speak…" : info?.left === 0 ? "That is today's messages. Back at 00:00 UTC." : "Ask about a token, a contract, a trade…"}
                  disabled={(mode === "text" ? info?.left === 0 : minfo?.left?.[mode] === 0 || !minfo?.open)}
                  aria-label="Message"
                  className="max-h-[220px] min-h-[46px] flex-1 resize-none bg-transparent px-3 py-3 text-[15px] text-text outline-none placeholder:text-muted focus:outline-none focus-visible:outline-none focus-visible:shadow-none"
                />
                {busy ? (
                  <button type="button" onClick={() => stop.current?.abort()} aria-label="Stop" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#5a3a26] text-text hover:border-[#ff9a5c]">
                    <span className="h-3 w-3 rounded-[2px] bg-current" />
                  </button>
                ) : (
                  <button type="submit" aria-label="Send" disabled={mode === "text" ? !draft.trim() || info?.left === 0 : !mm || !fileReady || (!draft.trim() && !mm.tool)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ff9a5c] text-[#1a0d06] transition-transform hover:scale-105 disabled:opacity-60">
                    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
                    </svg>
                  </button>
                )}
              </div>
              {(mode === "image" || mode === "video") && mm ? (
                <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1 pt-1.5">
                  {mm.options.map((o) => (
                    <OptChip key={o.id} o={o} value={optOf(o)} onChange={(v) => setMopts((s) => ({ ...s, [mm.id]: { ...s[mm.id], [o.id]: v } }))} />
                  ))}
                  <span className="ml-auto text-[12px] text-muted">{`~${mm.seconds} s`}</span>
                </div>
              ) : (
                <div className="flex justify-between px-3 pb-1 pt-1 font-mono text-[12px] text-muted">
                  <span>{`${draft.length} chars · ≈${Math.ceil(draft.length / 4)} tokens`}</span>
                  <span className="hidden sm:inline">Enter sends · Shift+Enter new line · never paste keys</span>
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
