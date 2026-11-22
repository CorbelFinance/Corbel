"use client";

import { useEffect } from "react";

/** Closes open header menus (<details data-menu>) on outside click, Escape, or navigation. */
export function MenuCloser() {
  useEffect(() => {
    const close = (except?: EventTarget | null) =>
      document.querySelectorAll<HTMLDetailsElement>("details[data-menu][open]").forEach((d) => {
        if (!except || !d.contains(except as Node)) d.open = false;
      });
    const onClick = (e: MouseEvent) => close(e.target);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
