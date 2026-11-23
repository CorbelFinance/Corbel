import { markupFor } from "@corbel/config";
import { tierOf } from "./tiers";

/** What Credits add on top of list price for this wallet: by its tier (Light 10%, Plus 5%, Full and Core none), 10% without one. */
export const markupOf = (owner: string | null | undefined) => markupFor(tierOf(owner));
