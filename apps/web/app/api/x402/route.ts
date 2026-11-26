import { NETWORK, PRICES, TOOLS, USDG, paidCalls, paymentsOpen, payTo } from "@/lib/x402";

export const dynamic = "force-dynamic";

/** GET /api/x402 → the paid tools, their prices in USDG and how to call them: the door for agents. */
export function GET() {
  return Response.json(
    {
      open: paymentsOpen(),
      x402Version: 1,
      scheme: "exact",
      network: NETWORK,
      asset: USDG,
      payTo: payTo(),
      tools: Object.entries(PRICES).map(([id, usdg]) => ({ id, usdg, ...TOOLS[id] })),
      how: "Call a tool without payment to get a 402 with what to sign (USDG ReceiveWithAuthorization). Sign it, send it base64 in X-PAYMENT, and the answer comes once the payment is in a block.",
      paid: paidCalls(),
    },
    { headers: { "cache-control": "public, max-age=30" } },
  );
}
