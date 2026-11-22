"use client";

/**
 * Counts for the owner: page views, clicks on links and buttons (their label only) and how long a visit lasted.
 * The visit id is random and lives in this tab only (sessionStorage); nothing is sent that names a person: no wallet,
 * no typed text, no query string. Once per visit it adds the time zone, phone or computer, and the site it came from
 * (the host only), so the owner can tell visits apart. Sent in small batches with sendBeacon; off when the browser asks not to be tracked.
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Ev = { k: "view" | "click" | "leave"; p: string; t?: string; ms?: number; q: number };

const sid = () => {
  try {
    let s = sessionStorage.getItem("corbel.v");
    if (!s) {
      s = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
      sessionStorage.setItem("corbel.v", s);
    }
    return s;
  } catch {
    return null;
  }
};

export function Tracker() {
  const path = usePathname() ?? "/";
  const box = useRef<{ q: Ev[]; seq: number; t0: number; timer: ReturnType<typeof setTimeout> | null }>({ q: [], seq: 0, t0: 0, timer: null });

  const flush = () => {
    const b = box.current;
    if (b.timer) clearTimeout(b.timer);
    b.timer = null;
    const s = sid();
    if (!s || !b.q.length) return;
    let v: { tz?: string; dev?: string; ref?: string } | undefined;
    try {
      if (!sessionStorage.getItem("corbel.vv")) {
        const r = document.referrer ? new URL(document.referrer).host : "";
        v = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, dev: matchMedia("(pointer: coarse)").matches ? (innerWidth < 768 ? "phone" : "tablet") : "computer", ref: r && r !== location.host ? r : "" };
        sessionStorage.setItem("corbel.vv", "1");
      }
    } catch {
      // the visit is counted without them
    }
    const body = JSON.stringify({ s, e: b.q.splice(0, 40), v });
    try {
      if (!navigator.sendBeacon?.("/api/t", new Blob([body], { type: "application/json" }))) void fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => undefined);
    } catch {
      // counting is never worth an error
    }
  };
  const push = (e: Omit<Ev, "q">) => {
    if (navigator.doNotTrack === "1" || (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const b = box.current;
    b.q.push({ ...e, q: b.seq++ });
    if (b.q.length >= 20) flush();
    else if (!b.timer) b.timer = setTimeout(flush, 4000);
  };

  // restore the sequence of this visit across reloads in the same tab
  useEffect(() => {
    try {
      box.current.seq = Number(sessionStorage.getItem("corbel.vq") ?? 0) || 0;
    } catch {
      // fresh count
    }
    box.current.t0 = Date.now();
    const click = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("a, button, [role='tab'], [role='option']") as HTMLElement | null;
      if (!el || el.closest("[data-no-track]")) return;
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
      if (label.trim()) push({ k: "click", p: location.pathname, t: label });
    };
    const hide = () => {
      push({ k: "leave", p: location.pathname, ms: Date.now() - box.current.t0 });
      try {
        sessionStorage.setItem("corbel.vq", String(box.current.seq));
      } catch {
        // fine
      }
      flush();
    };
    document.addEventListener("click", click, { capture: true, passive: true });
    addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("click", click, { capture: true });
      removeEventListener("pagehide", hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per tab
  }, []);

  useEffect(() => {
    push({ k: "view", p: path });
    try {
      sessionStorage.setItem("corbel.vq", String(box.current.seq));
    } catch {
      // fine
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view per path change
  }, [path]);

  return null;
}
