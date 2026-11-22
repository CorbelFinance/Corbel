"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BRAND, FACTS, FLAGS, LAYERS, STATUS_LABEL } from "@corbel/config";

/**
 * Corbel Devkit: a floating tool panel for the team. Development builds only; a production build never
 * renders it.
 * Everything it changes is local to this browser and reversible; nothing is sent anywhere.
 * Alt+D toggles the panel.
 */

type Toggles = {
  noMotion: boolean;
  pause: boolean;
  nodes: boolean;
  cols: boolean;
  sections: boolean;
  facts: boolean;
  accent: string; // "" = site default
};
const DEFAULTS: Toggles = { noMotion: false, pause: false, nodes: false, cols: false, sections: false, facts: false, accent: "" };
const KEY = "corbel-devkit";
const SECTIONS = ["top", "why", "story", "layers", "core", "compare", "journey", "safety", "data", "token", "roadmap", "faq"];
const ACCENTS = ["", "#2fbf72", "#2fd3a0", "#7cf29a", "#b6f23d"];

const read = <T,>(k: string, f: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : f;
  } catch {
    return f;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode: settings just don't persist */
  }
};

function useEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // development builds only: a production build never shows the panel, whatever the URL says
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(location.search).get("devkit");
    if (q === "1") write(`${KEY}:on`, true);
    if (q === "0") write(`${KEY}:on`, false);
    const id = window.setTimeout(() => setOn(true), 0);
    return () => clearTimeout(id);
  }, []);
  return on;
}

function Row({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="dk-row" title={hint}>
      <span>{label}</span>
      <span className={on ? "dk-sw dk-sw-on" : "dk-sw"} aria-hidden>
        <span />
      </span>
    </button>
  );
}

export function DevKit() {
  const enabled = useEnabled();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Toggles>(DEFAULTS);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [fps, setFps] = useState(0);
  const [chain, setChain] = useState("on");

  // load saved state once enabled
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => {
      setT({ ...DEFAULTS, ...read(`${KEY}:t`, DEFAULTS) });
      setOpen(read(`${KEY}:open`, false));
      setChain(new URLSearchParams(location.search).get("chain") ?? "on");
    }, 0);
    return () => clearTimeout(id);
  }, [enabled]);

  // apply toggles as classes on <html>
  useEffect(() => {
    if (!enabled) return;
    const h = document.documentElement;
    h.classList.toggle("dk-nomotion", t.noMotion);
    h.classList.toggle("dk-pause", t.pause);
    h.classList.toggle("dk-nodes", t.nodes);
    h.classList.toggle("dk-cols", t.cols);
    h.classList.toggle("dk-sections", t.sections);
    h.classList.toggle("dk-facts", t.facts);
    if (t.accent) h.style.setProperty("--leaf", t.accent);
    else h.style.removeProperty("--leaf");
    write(`${KEY}:t`, t);
  }, [t, enabled]);

  useEffect(() => {
    if (enabled) write(`${KEY}:open`, open);
  }, [open, enabled]);

  // live viewport + fps while open
  useEffect(() => {
    if (!enabled || !open) return;
    const size = () => setVp({ w: innerWidth, h: innerHeight });
    size();
    addEventListener("resize", size);
    let raf = 0,
      n = 0,
      t0 = performance.now();
    const loop = (now: number) => {
      n++;
      if (now - t0 >= 1000) {
        setFps(Math.round((n * 1000) / (now - t0)));
        n = 0;
        t0 = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      removeEventListener("resize", size);
      cancelAnimationFrame(raf);
    };
  }, [enabled, open]);

  // Alt+D
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [enabled]);

  const set = useCallback(<K extends keyof Toggles>(k: K, v: Toggles[K]) => setT((s) => ({ ...s, [k]: v })), []);

  const go = (params: Record<string, string | null>) => {
    const u = new URL(location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v === null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    window.location.assign(u.toString());
  };

  if (!enabled) return null;

  const bp = vp.w >= 1536 ? "2xl" : vp.w >= 1280 ? "xl" : vp.w >= 1024 ? "lg" : vp.w >= 768 ? "md" : vp.w >= 640 ? "sm" : "base";
  const factCounts = Object.values(FACTS).reduce<Record<string, number>>((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
  const onLanding = typeof location !== "undefined" && location.pathname === "/";


  return (
    <div className="dk-root" data-chain-obstacle="">
      <button type="button" className="dk-fab" aria-expanded={open} aria-controls="corbel-devkit" onClick={() => setOpen((o) => !o)} title={`${BRAND.name} devkit (Alt+D)`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
        <img src="/brand/corbel-logo-128.png" alt="" width={26} height={26} />
        <span className="sr-only">{open ? "Close" : "Open"} devkit</span>
      </button>

      {open && (
        <section id="corbel-devkit" className="dk-panel" aria-label={`${BRAND.name} devkit`}>
          <header className="dk-head">
            <span>
              {BRAND.name} · devkit
            </span>
            <span className="dk-dim">
              {vp.w}×{vp.h} · {bp} · {fps} fps
            </span>
          </header>

          <div className="dk-sec">
            <p className="dk-label">Page</p>
            {onLanding && (
              <div className="dk-chips">
                {SECTIONS.map((s) => (
                  <button key={s} type="button" className="dk-chip" onClick={() => document.getElementById(s)?.scrollIntoView({ behavior: "instant" as ScrollBehavior })}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="dk-chips">
              <button type="button" className="dk-chip" onClick={() => location.reload()}>
                Replay intro
              </button>
              <button type="button" className="dk-chip" onClick={() => scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })}>
                Top
              </button>
              <Link className="dk-chip" href="/status">
                Status
              </Link>
              <Link className="dk-chip" href="/app/trust/check">
                App
              </Link>
            </div>
          </div>

          <div className="dk-sec">
            <p className="dk-label">Motion</p>
            <Row label="Disable animations" on={t.noMotion} onClick={() => set("noMotion", !t.noMotion)} hint="Like prefers-reduced-motion, for this browser" />
            <Row label="Pause animations" on={t.pause} onClick={() => set("pause", !t.pause)} />
          </div>

          <div className="dk-sec">
            <p className="dk-label">Chain field</p>
            <div className="dk-seg" role="group" aria-label="Chain field mode">
              {(["on", "off", "debug"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={chain === m} className={chain === m ? "dk-seg-on" : ""} onClick={() => go({ chain: m === "on" ? null : m })}>
                  {m}
                </button>
              ))}
            </div>
            <Row label="Outline nodes and masks" on={t.nodes} onClick={() => set("nodes", !t.nodes)} hint="Green dashed: chain nodes. Red dashed: masks." />
          </div>

          <div className="dk-sec">
            <p className="dk-label">Layout</p>
            <Row label="12-column overlay" on={t.cols} onClick={() => set("cols", !t.cols)} />
            <Row label="Outline sections" on={t.sections} onClick={() => set("sections", !t.sections)} />
          </div>

          <div className="dk-sec">
            <p className="dk-label">Content</p>
            <Row label="Highlight unverified facts" on={t.facts} onClick={() => set("facts", !t.facts)} />
            <p className="dk-dim">
              Facts: {factCounts.verified ?? 0} verified · {factCounts.target ?? 0} target · {factCounts.unverified ?? 0} unverified · {factCounts.needed ?? 0} needed
            </p>
            <p className="dk-dim">
              Layers: {LAYERS.map((l) => `${l.name} ${STATUS_LABEL[FLAGS[l.id]].toLowerCase()}`).join(" · ")}
            </p>
          </div>

          <div className="dk-sec">
            <p className="dk-label">Accent preview (local only)</p>
            <div className="dk-chips">
              {ACCENTS.map((c) => (
                <button
                  key={c || "default"}
                  type="button"
                  aria-pressed={t.accent === c}
                  className={t.accent === c ? "dk-swatch dk-swatch-on" : "dk-swatch"}
                  style={{ background: c || "var(--leaf)" }}
                  onClick={() => set("accent", c)}
                  title={c || "Site default"}
                >
                  <span className="sr-only">{c || "Site default"}</span>
                </button>
              ))}
            </div>
          </div>

          <footer className="dk-foot">
            <button type="button" className="dk-chip" onClick={() => setT(DEFAULTS)}>
              Reset all
            </button>
            <span className="dk-dim">Alt+D</span>
          </footer>
        </section>
      )}
    </div>
  );
}
