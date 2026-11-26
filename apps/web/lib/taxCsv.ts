import type { ReportRow } from "@corbel/data/chain";

/**
 * The tax file: one line per movement, oldest first. Times are UTC. A token picks its own ticker, so a cell that a
 * spreadsheet would run as a formula (=, +, -, @, tab) is prefixed with a quote; numbers we wrote ourselves are not.
 */
const cell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Plain decimals, never 1e-7: a spreadsheet or an accountant's importer may not read the short form. */
const n = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(d).replace(/\.?0+$/, "") || "0");
/** The real base tokens: anything else wearing their ticker is a copy, usually sent as bait, and is not money. */
const REAL: Record<string, string> = { USDG: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", WETH: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", ETH: "0x0000000000000000000000000000000000000000", CORBEL: "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1" };
export const isCopy = (symbol: string, token: string) => {
  const real = REAL[symbol.trim().toUpperCase()];
  return !!real && real !== token.toLowerCase();
};

const HEAD = ["time_utc", "type", "token", "token_address", "amount_in", "amount_out", "other_side", "other_amount", "value_usd", "gas_eth", "gas_usd", "block", "tx", "note"];

export function taxCsv(rows: ReportRow[]): string {
  const lines = [...rows].reverse().map((r) =>
    [
      r.at ? new Date(r.at).toISOString().replace(".000Z", "Z") : "",
      r.kind,
      cell(r.symbol),
      r.token,
      r.amount > 0 ? n(r.amount, 12) : "",
      r.amount < 0 ? n(-r.amount, 12) : "",
      cell(r.counter?.symbol ?? ""),
      n(r.counter?.amount ?? null, 12),
      n(r.usd, 4),
      n(r.gasEth, 12),
      n(r.gasUsd, 6),
      String(r.block),
      r.tx,
      isCopy(r.symbol, r.token) ? `not the real ${r.symbol.trim().toUpperCase()}` : "",
    ].join(","),
  );
  return [HEAD.join(","), ...lines].join("\r\n") + "\r\n";
}
