/**
 * Corbel MCP server (stdio). Gives an AI agent Corbel's read-only tools: Trust checks, simulated quotes, a
 * pre-trade guard, the new pool radar and the mandate lab. It never signs or sends anything; every tool is a GET to the Corbel API.
 *
 *   node --experimental-strip-types packages/mcp/src/server.ts      (CORBEL_API, default https://corbel.finance)
 *
 * No dependencies: MCP is JSON-RPC 2.0, one message per line on stdin/stdout. Logs go to stderr only.
 */
import { createInterface } from "node:readline";

const API = (process.env.CORBEL_API ?? "https://corbel.finance").replace(/\/$/, "");
const PROTOCOL = "2025-06-18";

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; path: (a: Record<string, unknown>) => string };

const str = (v: unknown, max = 64) => String(v ?? "").trim().slice(0, max);

const TOOLS: Tool[] = [
  {
    name: "trust_check",
    description: "Seven checks on a Robinhood Chain token before buying: honeypot (buy and sell simulated), exit now, tax, owner powers, liquidity lock, ticker clones, creator history. Pass a 0x address or a ticker.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Token address (0x…) or ticker" } }, required: ["query"] },
    path: (a) => `/api/token?q=${encodeURIComponent(str(a.query))}`,
  },
  {
    name: "quote",
    description: "Simulate a swap on every route (V2, v4, two hops through ETH or USDG) at the latest block. Returns amount out, gas and price impact. Nothing is signed.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ETH, WETH, USDG or a token address" },
        to: { type: "string", description: "ETH, WETH, USDG or a token address" },
        amount: { type: "string", description: "Human amount of `from`, e.g. 0.5" },
      },
      required: ["from", "to", "amount"],
    },
    path: (a) => `/api/quote?from=${encodeURIComponent(str(a.from))}&to=${encodeURIComponent(str(a.to))}&amount=${encodeURIComponent(str(a.amount, 40))}`,
  },
  {
    name: "trade_guard",
    description: "Ask before every trade: may the agent make it under its owner's policy? Deny-first verdict (allow or deny) with each rule's result: Corbel Score floor, checks that must pass, simulated price impact, size cap, hooked pools, allow and deny lists. Trade only on allow.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token address (0x…)" },
        side: { type: "string", enum: ["buy", "sell"] },
        pay: { type: "string", enum: ["USDG", "ETH", "WETH"], default: "USDG" },
        amount: { type: "string", description: "What the agent puts in: pay units on a buy, token units on a sell" },
        maxIn: { type: "string", description: "Largest trade allowed, optional" },
        minScore: { type: "number", description: "Lowest Corbel Score, 0 to 100", default: 60 },
        maxImpact: { type: "number", description: "Largest price impact as a fraction, 0.02 = 2%", default: 0.02 },
        must: { type: "string", description: "Checks that may not fail, comma-separated", default: "honeypot,tax,exit" },
        noHooks: { type: "boolean", description: "Refuse routes through v4 hooks", default: true },
        allow: { type: "string", description: "Only these token addresses, comma-separated, optional" },
        deny: { type: "string", description: "Never these token addresses, comma-separated, optional" },
      },
      required: ["token", "side", "amount"],
    },
    path: (a) => {
      const q = new URLSearchParams({ token: str(a.token), side: str(a.side, 4), pay: str(a.pay ?? "USDG", 4), amount: str(a.amount, 40), minScore: String(Number(a.minScore ?? 60) || 0), maxImpact: String(Number(a.maxImpact ?? 0.02) || 0), must: str(a.must ?? "honeypot,tax,exit", 120) });
      if (a.maxIn) q.set("maxIn", str(a.maxIn, 40));
      if (a.noHooks !== false) q.set("hooks", "0");
      if (a.allow) q.set("allow", str(a.allow, 2000));
      if (a.deny) q.set("deny", str(a.deny, 2000));
      return `/api/guard?${q.toString()}`;
    },
  },
  {
    name: "radar",
    description: "Newest pools on Robinhood Chain from Corbel's index, with the launcher's pool count and whether the pool is drained.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "1 to 50", default: 10 } } },
    path: (a) => `/api/radar?limit=${Math.min(50, Math.max(1, Number(a.limit ?? 10) || 10))}`,
  },
  {
    name: "mandate_scenarios",
    description: "List the attack scenarios for the Corbel mandate lab.",
    inputSchema: { type: "object", properties: {} },
    path: () => "/api/mandate",
  },
  {
    name: "mandate_try",
    description: "Run one attack against a real Corbel mandate (deployed inside a simulation of the live chain). Shows which rule stopped the agent and how much bond it lost.",
    inputSchema: { type: "object", properties: { scenario: { type: "string", description: "Scenario id from mandate_scenarios" } }, required: ["scenario"] },
    path: (a) => `/api/mandate?s=${encodeURIComponent(str(a.scenario, 40))}`,
  },
];

function send(msg: unknown) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function callTool(name: string, args: Record<string, unknown>) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] };
  try {
    const r = await fetch(API + t.path(args ?? {}), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
    const text = await r.text();
    return { isError: !r.ok, content: [{ type: "text", text }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Corbel API did not answer: ${(e as Error).message}` }] };
  }
}

async function handle(m: { id?: number | string; method?: string; params?: Record<string, unknown> }) {
  const reply = (result: unknown) => m.id !== undefined && send({ jsonrpc: "2.0", id: m.id, result });
  switch (m.method) {
    case "initialize":
      return reply({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "corbel", version: "0.1.0" } });
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const p = m.params as { name: string; arguments?: Record<string, unknown> };
      return reply(await callTool(p.name, p.arguments ?? {}));
    }
    default:
      if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void handle(msg as Parameters<typeof handle>[0]);
});
process.stderr.write(`[corbel-mcp] ready, API ${API}\n`);
