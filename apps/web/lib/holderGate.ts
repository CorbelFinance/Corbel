/**
 * Tools only $CORBEL holders can open (HOLDER_ONLY in @corbel/config): a tool listed there answers only a signed-in
 * wallet whose tier (lowest balance of the last week plus locked coins, lib/tiers) reaches the tier named for it.
 * Everyone else gets a plain 403 that says which tier opens it. Admin and top wallets pass like a Full holder.
 */
import { AI_ACCESS, HOLDER_ONLY, type AiTier } from "@corbel/config";
import { session } from "./auth";
import { tierOf } from "./tiers";

const ORDER = AI_ACCESS.tiers.map((t) => t.id);
const NAMES: Record<keyof typeof HOLDER_ONLY, string> = { preview: "Before you sign", drain: "The drain alarm" };

export type HolderTool = keyof typeof HOLDER_ONLY;

export function holderOk(address: string | null | undefined, tool: HolderTool): boolean {
  const need = HOLDER_ONLY[tool];
  if (!need) return true;
  const t: AiTier | null = tierOf(address);
  return !!t && ORDER.indexOf(t.id) >= ORDER.indexOf(need);
}

/** null when the request may use the tool; otherwise the 403 to send. */
export function holderGate(req: Request, tool: HolderTool): Response | null {
  const need = HOLDER_ONLY[tool];
  const s = session(req);
  // open to every signed-in wallet when no tier is named
  if (!need) return s ? null : Response.json({ error: `${NAMES[tool]} is open to every wallet that signs in: one message, no gas.`, need: null, signedIn: false }, { status: 401 });
  if (s && holderOk(s.address, tool)) return null;
  const tier = AI_ACCESS.tiers.find((t) => t.id === need)!;
  return Response.json(
    { error: `${NAMES[tool]} is open to $CORBEL holders from the ${tier.name} tier: ${tier.minCoins.toLocaleString("en-US")} held through the week, or locked.`, need, signedIn: !!s },
    { status: 403 },
  );
}
