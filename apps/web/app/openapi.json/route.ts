import { BRAND } from "@corbel/config";
import { NETWORK, PRICES, TOOLS, USDG } from "@/lib/x402";

export const dynamic = "force-static";

/**
 * GET /openapi.json → the paid x402 tools and the main free reads as OpenAPI 3.1, so an agent can find and call them
 * without reading the site. Each paid operation carries its price under `x-payment` (x402, scheme "exact"); calling it
 * unpaid answers 402 with the exact terms to sign. Built from lib/x402, the same list that is charged.
 */
const PARAMS: Record<string, { in: "query"; name: string; schema: { type: "string" }; required: true; description: string }[]> = {
  token: [{ in: "query", name: "q", required: true, schema: { type: "string" }, description: "A token address (0x…)." }],
  replay: [{ in: "query", name: "tx", required: true, schema: { type: "string" }, description: "The hash of a transaction that reverted." }],
  ledger: [{ in: "query", name: "token", required: true, schema: { type: "string" }, description: "A token address (0x…)." }],
};

export function GET() {
  const site = `https://${BRAND.domains.site}`;
  const paths: Record<string, unknown> = {};
  for (const [id, t] of Object.entries(TOOLS)) {
    const op = {
      operationId: `x402_${id}`,
      summary: t.what,
      tags: ["paid"],
      "x-payment": { protocol: "x402", scheme: "exact", network: NETWORK, asset: USDG, amountUsd: PRICES[id], currency: "USDG", header: "X-PAYMENT" },
      ...(PARAMS[id] ? { parameters: PARAMS[id] } : {}),
      ...(t.method === "POST"
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" }, value: { type: "string" }, data: { type: "string" } } } } },
            },
          }
        : {}),
      responses: {
        "200": { description: "The answer, after the payment is settled on chain. X-PAYMENT-RESPONSE holds the transaction." },
        "402": { description: "Payment required: the price, the wallet to pay and what to sign." },
      },
    };
    paths[`/api/x402/${id}`] = { [t.method.toLowerCase()]: op };
  }
  paths["/api/x402"] = { get: { operationId: "x402_list", summary: "Every paid tool, its price and how to call it.", tags: ["paid"], responses: { "200": { description: "The list." } } } };
  paths["/api/token"] = {
    get: {
      operationId: "token_check",
      summary: "Seven checks of a token and its Corbel score out of 90. Free, rate limited.",
      tags: ["free"],
      parameters: [{ in: "query", name: "q", required: true, schema: { type: "string" }, description: "A token address or ticker." }],
      responses: { "200": { description: "The checks." } },
    },
  };
  paths["/api/guard"] = {
    get: {
      operationId: "trade_guard",
      summary: "Allow or deny one trade against a policy, simulated at the latest block. Free, rate limited.",
      tags: ["free"],
      parameters: [
        { in: "query", name: "token", required: true, schema: { type: "string" } },
        { in: "query", name: "side", required: true, schema: { type: "string", enum: ["buy", "sell"] } },
        { in: "query", name: "amount", required: true, schema: { type: "string" } },
      ],
      responses: { "200": { description: "verdict: allow or deny, with each rule's detail." } },
    },
  };
  const doc = {
    openapi: "3.1.0",
    info: { title: `${BRAND.name} API`, version: "1", description: `${BRAND.description} Paid tools use x402: no account, no API key. Read ${site}/llms.txt first.` },
    servers: [{ url: site }],
    externalDocs: { url: `${site}/skill.md`, description: "The skill file for agents" },
    paths,
  };
  return Response.json(doc, { headers: { "cache-control": "public, max-age=3600" } });
}
