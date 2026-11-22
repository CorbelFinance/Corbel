"use client";

import { useEffect } from "react";

/**
 * Section entrance: one observer for the page. A section ([data-rg]) gets .is-in when it enters,
 * and its blocks rise in one after another (CSS in globals.css). Anything already above the viewport
 * (anchor jumps, reloads mid-page) is marked at once, so nothing is ever left hidden.
 *
 * This component lives in the site layout, which stays mounted when moving between site pages. Sections of a page
 * reached by an in-site link are therefore picked up as they appear (MutationObserver), not only on first load:
 * before 2026-11-21 they were never observed and stayed invisible (a black page after clicking the logo).
 * A sweep once a second shows any section that is on or above the screen and still hidden, whatever the cause.
 */
export function RevealRoot() {
  useEffect(() => {
    const mark = (el: Element) => el.classList.add("is-in");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            mark(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    const watched = new WeakSet<Element>();
    const scan = () => {
      for (const g of Array.from(document.querySelectorAll("[data-rg]:not(.is-in)"))) {
        if (watched.has(g)) continue;
        watched.add(g);
        io.observe(g);
      }
    };
    scan();
    // new pages arrive without a reload: watch for their sections (one scan per frame at most)
    let queued = 0;
    const mo = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // the safety net: nothing on or above the screen stays hidden
    const sweep = window.setInterval(() => {
      for (const g of Array.from(document.querySelectorAll("[data-rg]:not(.is-in)"))) {
        if (g.getBoundingClientRect().top < innerHeight) mark(g);
      }
    }, 1000);
    document.documentElement.classList.add("rg-ready");
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(queued);
      clearInterval(sweep);
    };
  }, []);
  return null;
}
