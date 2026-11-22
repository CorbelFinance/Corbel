"use client";

/**
 * After a move to another page with a #block in the link, the blocks below can still be growing while the browser
 * scrolls, so it can stop short. Once the page has settled, land on the block exactly.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function HashScroll() {
  const path = usePathname();
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const t = [250, 900].map((ms) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), ms));
      return () => t.forEach(clearTimeout);
    };
    const stop = go();
    window.addEventListener("hashchange", go);
    return () => {
      stop?.();
      window.removeEventListener("hashchange", go);
    };
  }, [path]);
  return null;
}
