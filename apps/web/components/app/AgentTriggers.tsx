"use client";

/**
 * Agents · Learn · triggers. The agent's exit rules as a table: when this happens, the agent does that, and whether it
 * is watching or has fired, for each open practice position. Conditions are read live: the token check at the latest
 * block (/api/token) and the position's value at a live quote (/api/quote). Paper only: a fired rule is shown, not traded.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@corbel/ui";
import { Instrument, Led } from "./kit";
import { USDG, type Book, type Pos } from "@/lib/practice";

type Check = { checks?: { id: string; result: string }[] };
type Live = { pos: Pos; check: Check | null; value: number | null };
type Trig = { id: string; when: string; does: string; fires: (l: Live) => boolean | null };

const failed = (l: Live, id: string) => (l.check?.checks ? l.check.checks.some((c) => c.id === id && c.result === "fail") : null);
export const TRIGGERS: Trig[] = [
  { id: "exit", when: "A buyer-size bag can no longer sell into the pool", does: "Sell everything", fires: (l) => failed(l, "exit") },
  { id: "honeypot", when: "Selling is blocked in the simulation", does: "Stop buying, flag the position", fires: (l) => failed(l, "honeypot") },
  { id: "tax", when: "A transfer tax appears on buy or sell", does: "Sell everything", fires: (l) => failed(l, "tax") },
  { id: "owner", when: "The owner gains rights that can hurt holders", does: "Sell half", fires: (l) => failed(l, "owner") },
  { id: "liquidity", when: "The pool's liquidity can be pulled", does: "Stop buying", fires: (l) => failed(l, "liquidity") },
  { id: "drop", when: "The position is down a fifth from its cost", does: "Sell half", fires: (l) => (l.value == null ? null : l.value <= l.pos.cost * 0.8) },
];

/** The amount in the token's own units, as /api/quote takes it (the same form Practice sends). */
const dec = (n: number, d: number) => n.toFixed(Math.min(d, 18)).replace(/\.?0+$/, "") || "0";

export function AgentTriggers({ book }: { book: Book }) {
  const positions = Object.values(book.positions);
  const [live, setLive] = useState<Live[] | null>(null);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    let off = false;
    const read = async () => {
      const rows = await Promise.all(
        positions.map(async (pos): Promise<Live> => {
          const [check, value] = await Promise.all([
            fetch(`/api/token?q=${pos.token}`).then((r) => r.json() as Promise<Check>).catch(() => null),
            fetch(`/api/quote?from=${pos.token}&to=${USDG}&amount=${dec(pos.amount, pos.decimals)}`)
              .then((r) => r.json() as Promise<{ routes?: { amountOut: string | null }[]; best?: number | null }>)
              .then((j) => (j.best != null && j.routes?.[j.best]?.amountOut ? Number(j.routes[j.best]!.amountOut) / 1e6 : null))
              .catch(() => null),
          ]);
          return { pos, check, value };
        }),
      );
      if (!off) {
        setLive(rows);
        setAt(Date.now());
      }
    };
    void read();
    const t = setInterval(() => void read(), 120_000);
    return () => {
      off = true;
      clearInterval(t);
    };
    // positions are read once per book change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  const firedCount = live ? TRIGGERS.reduce((s, t) => s + live.filter((l) => t.fires(l) === true).length, 0) : 0;
  return (
    <Instrument
      code="G-64"
      title="When this happens, your agent does that"
      busy={!!positions.length && !live}
      status={<Led tone={firedCount ? "bad" : positions.length ? "on" : "off"} live={!!positions.length} label={!positions.length ? "no open positions" : firedCount ? `${firedCount} fired` : `watching ${positions.length} position${positions.length > 1 ? "s" : ""}`} />}
      foot={<span>{`Read from the token check at the latest block and a live quote, every two minutes${at ? `; last at ${new Date(at).toISOString().slice(11, 16)} UTC` : ""}. Paper only: a fired rule is shown, not traded.`}</span>}
    >
      {!positions.length ? (
        <p className="p-5 text-[13.5px] text-muted">
          No open practice positions. <Link href="/app/trade/practice" className="text-leaf underline underline-offset-4">Open one in Practice</Link> and the agent watches it with the rules below.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">
                <th className="px-4 py-2 font-normal">When this happens</th>
                <th className="px-4 py-2 font-normal">Your agent</th>
                <th className="px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {TRIGGERS.map((t) => {
                const hit = live?.filter((l) => t.fires(l) === true) ?? [];
                const unknown = live?.filter((l) => t.fires(l) == null).length ?? 0;
                return (
                  <tr key={t.id} className={cx("border-b border-line/50 align-top", hit.length > 0 && "bg-flesh/[0.05]")}>
                    <td className="px-4 py-2.5 text-text">{t.when}</td>
                    <td className="px-4 py-2.5 text-muted">{t.does}</td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">
                      {!live ? (
                        <span className="text-muted">reading</span>
                      ) : hit.length ? (
                        <span className="text-flesh">{`fired · ${hit.map((l) => `$${l.pos.symbol}`).join(", ")}`}</span>
                      ) : (
                        <span className="text-leaf">{`watching${unknown ? ` · ${unknown} not read` : ""}`}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Instrument>
  );
}
