import { BRAND } from "@corbel/config";
import { NETWORK, PRICES, TOOLS, USDG } from "@/lib/x402";

export const dynamic = "force-static";

/**
 * GET /llms.txt → what Corbel is and where an AI agent or an AI search engine should look, in plain markdown
 * (llmstxt.org). Built from the same tool list and prices as /api/x402, so it never drifts from what is charged.
 */
export function GET() {
  const site = `https://${BRAND.domains.site}`;
  const paid = Object.entries(TOOLS)
    .map(([id, t]) => `- [${id}](${site}/api/x402/${id}): ${t.what} ${t.method}, $${PRICES[id]} USDG a call.`)
    .join("\n");
  const body = `# ${BRAND.name}

> ${BRAND.description} Corbel reads the chain and simulates; it never asks for a key, never signs and never holds funds.

Robinhood Chain, chain id 4663. Every answer says which block it was read at.

## For agents

- [Skill file](${site}/skill.md): the free API an agent uses before it buys, sells, holds or approves a token, and the rules it follows.
- [OpenAPI description](${site}/openapi.json): the paid tools and the main free reads, machine-readable.
- [MCP server](https://github.com/CorbelFinance/Corbel/tree/main/packages/mcp): the same tools for MCP clients.

## Pay per call (x402)

No account and no API key. Call a tool without payment to get HTTP 402 with the price and what to sign (USDG ReceiveWithAuthorization, scheme "exact", network ${NETWORK}, asset ${USDG}). Sign it, send it base64 in the X-PAYMENT header, and the answer comes once the payment is in a block. A tool that fails is never charged.

- [Price list](${site}/api/x402): every paid tool, its price and how to call it.
${paid}

## Free reads

- [Token check](${site}/api/token?q=0x0bd7d308f8e1639fab988df18a8011f41eacad73): seven checks and a score out of 90.
- [Trade guard](${site}/skill.md): allow or deny one trade against a policy, simulated at the latest block.
- [Swap quote](${site}/app/trade/quote): one quote across every pool.

## Docs

- [Overview](${site}/docs/overview)
- [Changelog](${site}/changelog)
- [Roadmap](${site}/roadmap)
- [Source code](https://github.com/CorbelFinance/Corbel)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
