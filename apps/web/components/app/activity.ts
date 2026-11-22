"use client";

/**
 * The visitor's own swaps sent from Corbel, kept in this browser only (never sent to the server).
 * SwapButton writes; the "Your swaps" panels read and update live through a window event.
 */
import { useEffect, useState } from "react";

export type Act = { at: number; hash: string; from: string; to: string; amount: string; quoted: string; got: string | null; status: "pending" | "done" | "failed" };
const KEY = "corbel.activity";
const EVENT = "corbel:activity";
const MAX = 30;

export function readActs(): Act[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Act[];
  } catch {
    return [];
  }
}

export function saveAct(a: Act) {
  try {
    const list = [a, ...readActs().filter((x) => x.hash !== a.hash)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage off: the panel just stays empty
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearActs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useActs() {
  const [acts, setActs] = useState<Act[]>([]);
  useEffect(() => {
    const on = () => setActs(readActs());
    void Promise.resolve().then(on);
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return acts;
}
