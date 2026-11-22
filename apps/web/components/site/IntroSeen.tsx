"use client";

/**
 * The landing's intro (the loader and the delayed hero) is for an arrival or a reload. A click from one page of the
 * site to another is a client navigation: the head script that sets `intro-seen` does not run again, so the hero
 * would wait 3 s for an intro that never plays and the screen stays black. Mark it the moment the path changes,
 * before the new page paints.
 */
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function IntroSeen() {
  const path = usePathname();
  const first = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (first.current !== null && first.current !== path) document.documentElement.classList.add("intro-seen");
    first.current = path;
  }, [path]);
  return null;
}
