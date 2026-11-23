"use client";

/**
 * Home · the ask bar. One field for everything Corbel does: a token address or ticker, an image or a GPU, a wallet,
 * a yield, an agent. As you type it works out what you mean and shows a live answer from the tool that does it
 * (a price, the cheapest model, the GPU that fits). Enter opens that tool. Example prompts type themselves in the
 * placeholder until you start.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@corbel/ui";
import { score, type Check, type HoldersIn } from "@/components/app/score";

type Trend = { token: string; symbol: string | null; price?: number | null; change?: number | null };
type Model = { id: string; name: string; maker: string; pin: number; pout: number; pimg: number | null; kind: string; created: number };
type Gpu = { name: string; vram: number; secure: number | null; community: number | null };
type Answer = { k: string; title: string; line: string; href: string; tone: string };
type Verdict = { token: string; symbol: string; total: number; tag: string; failed: string[]; warned: number; n: number };

const EXAMPLES = ["is TSLA safe to buy", "NVDA", "draw a city at night", "GPU for a 70B model", "stress test my wallet", "best pool yield", "give my agent a budget"];
const money = (v: number) => (v < 0.01 ? `$${v.toPrecision(2)}` : v < 10 ? `$${v.toFixed(2)}` : `$${v.toLocaleString("en", { maximumFractionDigits: 0 })}`);

export function AskBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ph, setPh] = useState("");
  const [trend, setTrend] = useState<{ rows: Trend[]; stocks: Trend[] } | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [gpus, setGpus] = useState<Gpu[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // the placeholder types example asks, one after another
  useEffect(() => {
    if (q) return;
    let i = 0;
    let c = 0;
    let back = false;
    const t = setInterval(() => {
      const s = EXAMPLES[i % EXAMPLES.length]!;
      if (!back) {
        c++;
        if (c > s.length + 14) back = true;
      } else {
        c -= 2;
        if (c <= 0) {
          back = false;
          c = 0;
          i++;
        }
      }
      setPh(s.slice(0, Math.max(0, Math.min(c, s.length))));
    }, 55);
    return () => clearInterval(t);
  }, [q]);
  useEffect(() => {
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j: { rows?: Trend[]; stocks?: Trend[] }) => setTrend({ rows: j.rows ?? [], stocks: j.stocks ?? [] }))
      .catch(() => undefined);
    fetch("/api/compute?what=models")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: Model[] } | null) => j?.rows && setModels(j.rows))
      .catch(() => undefined);
    fetch("/api/compute?what=gpus")
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((j: { rows?: Gpu[] } | null) => j?.rows && setGpus(j.rows))
      .catch(() => undefined);
  }, []);

  // the token the ask is about: a pasted address, or a ticker the index knows
  const target = useMemo(() => {
    const s = q.trim().toLowerCase();
    const addr = s.match(/0x[0-9a-f]{40}/)?.[0];
    if (addr) return addr;
    const words = s.split(/\s+/).map((w) => w.replace(/^\$/, "").replace(/[?!.,]/g, ""));
    const all = [...(trend?.stocks ?? []), ...(trend?.rows ?? [])];
    const hit = all.find((r) => r.symbol && words.includes(r.symbol.toLowerCase()) && r.symbol.length >= 2);
    return hit?.token.toLowerCase() ?? null;
  }, [q, trend]);
  useEffect(() => {
    if (!target) return;
    let off = false;
    const t = setTimeout(() => {
      fetch(`/api/token?q=${target}`)
        .then((r) => (r.status === 200 ? r.json() : null))
        .then((j: { checks?: Check[]; meta?: { symbol: string | null }; holders?: HoldersIn | null; market?: { liquidity: number } | null } | null) => {
          if (off || !j?.checks?.length) return;
          const sc = score(j.checks, j.holders, j.market);
          setVerdict({ token: target, symbol: j.meta?.symbol ?? "Token", total: sc.total, tag: sc.tag, failed: j.checks.filter((c) => c.result === "fail").map((c) => c.name), warned: j.checks.filter((c) => c.result === "warn").length, n: j.checks.length });
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [target]);
  const shownVerdict = verdict && target === verdict.token ? verdict : null;

  const answers = useMemo<Answer[]>(() => {
    const s = q.trim();
    const l = s.toLowerCase();
    if (!s) return [];
    const out: Answer[] = [];
    const addr = s.match(/0x[0-9a-fA-F]{40}/)?.[0];
    if (addr) {
      out.push({ k: "Check", title: "Check this token before you buy", line: "Seven checks: can you sell, taxes, owner powers, liquidity, creator.", href: `/app/trade/check?q=${addr}`, tone: "#6cc0d0" });
      out.push({ k: "Trade", title: "Open its chart", line: "Price, swaps, depth and the best route.", href: `/app/trade/terminal?token=${addr}`, tone: "#6fe7a8" });
      out.push({ k: "Wallet", title: "Or read it as a wallet", line: "What others see: holdings, swaps, exposure.", href: `/app/wallet/exposure?address=${addr}`, tone: "#93a6ff" });
      return out;
    }
    // any word of the ask that is a known ticker, not only the first
    const words = l.split(/\s+/).map((w) => w.replace(/^\$/, "").replace(/[?!.,]/g, ""));
    const known = new Set([...(trend?.stocks ?? []), ...(trend?.rows ?? [])].map((r) => (r.symbol ?? "").toLowerCase()));
    const tick = words.find((w) => w.length >= 2 && known.has(w)) ?? words[0] ?? "";
    const all = [...(trend?.stocks ?? []), ...(trend?.rows ?? [])];
    const hit = tick.length >= 2 ? all.find((r) => (r.symbol ?? "").toLowerCase() === tick) : undefined;
    if (hit) out.push({ k: "Trade", title: `${hit.symbol} ${hit.price ? money(hit.price) : ""}`, line: hit.change != null ? `${hit.change >= 0 ? "+" : ""}${hit.change.toFixed(1)}% today. Chart, check and best route.` : "Chart, check and best route.", href: `/app/trade/terminal?token=${hit.token}`, tone: "#6fe7a8" });
    if (/draw|image|picture|photo|logo|art|video/.test(l)) {
      const img = (models ?? []).filter((m) => m.kind === "image").sort((a, b) => b.created - a.created)[0];
      out.push({ k: "AI", title: img ? `Draw it with ${img.name}` : "Draw it with an image model", line: img?.pimg ? `${money(img.pimg)} an image, paid from your balance.` : "Every image model, priced live.", href: "/app/ai/studio", tone: "#ff9a5c" });
    }
    const b = l.match(/(\d{1,3})\s*b\b/);
    if (/gpu|rent|h100|a100|4090|vram/.test(l) || b) {
      const need = b ? Math.ceil(Number(b[1]) * 2 * 1.2) : 24;
      const g = (gpus ?? []).filter((x) => x.vram >= need).sort((x, y) => Math.min(x.community ?? 1e9, x.secure ?? 1e9) - Math.min(y.community ?? 1e9, y.secure ?? 1e9))[0];
      out.push({ k: "AI", title: g ? `${g.name}, ${g.vram} GB` : "Find a GPU that fits", line: g ? `Holds ${b ? `${b[1]}B at FP16` : "most models"} from ${money(Math.min(g.community ?? 1e9, g.secure ?? 1e9))} an hour.` : "Hourly rates for every GPU type.", href: "/app/ai/gpus", tone: "#f2c46d" });
    }
    if (/write|code|chat|\bai\b|gpt|claude|gemini|grok|deepseek|llm|qwen|llama|mistral|kimi/.test(l) || (/model/.test(l) && !/gpu|\d\s*b\b/.test(l))) {
      const name = ["claude", "gpt", "gemini", "grok", "deepseek", "qwen", "llama", "mistral", "kimi"].find((n) => l.includes(n));
      const lead = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen"];
      const rank = (x: Model) => (lead.includes(x.maker) ? 0 : 1);
      const m = (models ?? []).filter((x) => (name ? x.id.includes(name) || x.name.toLowerCase().includes(name) : x.kind === "text") && x.pin > 0 && !x.id.includes(":") && !/batch/i.test(x.name)).sort((a, c) => rank(a) - rank(c) || c.created - a.created)[0];
      out.push({ k: "AI", title: m ? m.name : "Every AI model", line: m ? `${money(m.pin)} in and ${money(m.pout)} out per million tokens. Compare who runs it cheapest.` : "Live prices across providers.", href: m ? `/app/ai/models?id=${encodeURIComponent(m.id)}` : "/app/ai/models", tone: "#ff8fa3" });
    }
    if (/wallet|stress|exposure|portfolio|share|paper/.test(l)) out.push({ k: "Wallet", title: /stress/.test(l) ? "Stress test a wallet" : /paper/.test(l) ? "Trade on paper" : /share/.test(l) ? "Share without the address" : "See a wallet as others do", line: "Read any address. Nothing is signed.", href: /stress/.test(l) ? "/app/wallet/stress" : /paper/.test(l) ? "/app/wallet/paper" : /share/.test(l) ? "/app/wallet/share" : "/app/wallet/exposure", tone: "#93a6ff" });
    if (/earn|yield|pool|lp|apr|fee/.test(l)) out.push({ k: "Earn", title: "Pools and what their LPs earned", line: "Fee yield, kept after the price move, and a position planner.", href: "/app/account/pools", tone: "#f2c46d" });
    if (/agent|bot|budget|mandate|guard/.test(l)) out.push({ k: "Agents", title: "Give an agent a budget it cannot break", line: "Rules on chain, a guard before every trade, a bond that pays you.", href: "/app/agents/guard", tone: "#9b86e4" });
    if (/sell|split|exit/.test(l)) out.push({ k: "Trade", title: "Sell in parts", line: "One big sell against the same sell in parts, simulated.", href: "/app/trade/split", tone: "#6fe7a8" });
    if (/whale|big swap|large/.test(l)) out.push({ k: "Trade", title: "Big swaps", line: "The largest swaps on the chain and the wallets behind them.", href: "/app/trade/whales", tone: "#ff9a5c" });
    if (!out.length) out.push({ k: "Check", title: `Search for “${s}”`, line: "Tickers and names across the chain, with the checks.", href: `/app/trade/check?q=${encodeURIComponent(s)}`, tone: "#6cc0d0" });
    return out.slice(0, 3);
  }, [q, trend, models, gpus]);

  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState(false);
  // "/" anywhere on the page puts the cursor in the bar
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const pickIdx = Math.min(sel, Math.max(0, answers.length - 1));
  const lead = answers[pickIdx];
  const reach = [
    trend ? `${(trend.rows.length + trend.stocks.length).toLocaleString("en")} live tokens` : null,
    models ? `${models.length.toLocaleString("en")} AI models` : null,
    gpus ? `${gpus.length} GPU types` : null,
    "any wallet",
  ].filter(Boolean) as string[];
  const STARTS = [
    { s: "NVDA", k: "Stock", tone: "#6cc0d0" },
    { s: "is TSLA safe to buy", k: "Check", tone: "#6fe7a8" },
    { s: "GPU for a 70B model", k: "GPU", tone: "#f2c46d" },
    { s: "draw a city at night", k: "AI", tone: "#ff9a5c" },
    { s: "stress test my wallet", k: "Wallet", tone: "#93a6ff" },
    { s: "give my agent a budget", k: "Agent", tone: "#9b86e4" },
  ];

  return (
    <div className="w-full max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (lead) router.push(lead.href);
        }}
        className={cx("ask-ring relative rounded-[26px] p-[1.5px]", focus && "is-on")}
      >
        <div className="ask-bar relative flex items-center gap-3 rounded-[25px] bg-[#090909]/95 p-2.5 pl-6 backdrop-blur-md">
          <span aria-hidden className="font-mono text-[22px] text-leaf">›</span>
          <label htmlFor="ask" className="sr-only">
            Ask Corbel
          </label>
          <input
            ref={input}
            id="ask"
            value={q}
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((v) => Math.min(answers.length - 1, v + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((v) => Math.max(0, v - 1)));
              if (e.key === "Escape") setQ("");
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder={ph || "Ask Corbel"}
            className="ask-input h-14 min-w-0 flex-1 bg-transparent text-[19px] text-text placeholder:text-muted sm:text-[21px]"
          />
          {/* what the bar understood, and where Enter goes */}
          {lead ? (
            <span key={lead.k + lead.title} className="tile-in hidden shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] md:flex" style={{ borderColor: `${lead.tone}66`, color: lead.tone }}>
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: lead.tone }} />
              {`${lead.k} · Enter`}
            </span>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[12px] text-muted md:block">/</kbd>
          )}
          <button type="submit" className="h-14 shrink-0 rounded-[18px] bg-[#42ee8f] px-6 text-[16px] font-semibold text-[#0b0b0b] transition-transform active:scale-95">
            Go
          </button>
        </div>
      </form>

      {q ? (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-[#090909]/95 text-left backdrop-blur" aria-live="polite">
          {shownVerdict && (() => {
            const bad = shownVerdict.failed.length > 0 || /RISKY|TRAP/.test(shownVerdict.tag), mid = !bad && /SKETCHY/.test(shownVerdict.tag);
            const tone = bad ? "#ff4560" : mid ? "#e3b341" : "#6fe7a8";
            return (
              <li className="tile-in border-b border-[#1a1a1a]">
                <Link href={`/app/trade/check?q=${shownVerdict.token}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-leaf/[0.04]">
                  <span className="w-16 shrink-0 font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: tone }}>Verdict</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">
                      {`${shownVerdict.symbol}: `}
                      <span style={{ color: tone }}>{`${shownVerdict.total} of 90, ${shownVerdict.tag}`}</span>
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {shownVerdict.failed.length ? `Failed: ${shownVerdict.failed.join(", ")}.` : `${shownVerdict.n - shownVerdict.warned} of ${shownVerdict.n} checks passed${shownVerdict.warned ? `, ${shownVerdict.warned} to look at` : ""}.`} Open the full report.
                    </span>
                  </span>
                </Link>
              </li>
            );
          })()}
          {answers.map((a, i) => (
            <li key={a.k + a.title} className="tile-in border-b border-[#1a1a1a] last:border-0" style={{ animationDelay: `${i * 0.05}s` }}>
              <Link href={a.href} onMouseEnter={() => setSel(i)} className={cx("flex items-center gap-4 px-5 py-3.5 transition-colors", i === pickIdx ? "bg-leaf/[0.07]" : "hover:bg-leaf/[0.04]")}>
                <span className="w-16 shrink-0 font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: a.tone }}>
                  {a.k}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-text">{a.title}</span>
                  <span className="block truncate text-[12.5px] text-muted">{a.line}</span>
                </span>
                <span aria-hidden className={cx("font-mono text-[13px] transition-opacity", i === pickIdx ? "text-leaf opacity-100" : "opacity-0")}>
                  ↵
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {STARTS.slice(0, 4).map((x, i) => (
            <li key={x.s} className="tile-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <button type="button" onClick={() => (setQ(x.s), input.current?.focus())} className="flex items-center gap-2 rounded-full border border-line bg-[#090909]/80 py-1.5 pl-2 pr-3.5 text-[13px] text-muted backdrop-blur transition-colors hover:border-[color:var(--t)] hover:text-text" style={{ ["--t" as string]: x.tone }}>
                <span className="rounded-full px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.06em]" style={{ background: `${x.tone}1f`, color: x.tone }}>
                  {x.k}
                </span>
                {x.s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!q && <p className="sr-only">{`Searches ${reach.join(", ")}.`}</p>}
    </div>
  );
}
