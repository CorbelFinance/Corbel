import { getClient } from "@corbel/data/chain";
import { parseAbi } from "viem";
import { launcherHistory, tokenOrigin } from "@corbel/indexer";
import { dsTokens, type DsPair } from "@/lib/pairs";
import { briefModel, modelsReady } from "@/lib/compute";
import { holdersBrief, holdersOf } from "@/lib/holdersOf";
import { xPosts } from "@/lib/xPosts";
import { safeFetch } from "./safeFetch";

/**
 * Claims against reality for the project behind a token: what it says (its website and the pages it links,
 * its public Telegram channel, its X profile, its code) next to what can be checked (contracts on the chain,
 * code pushes, who holds the token, the creator's record, the age of the domain and the account).
 *
 * A model only lists the claims, each with the exact words it found. Every quote is checked word for word against
 * the text we fetched (a claim we cannot find is dropped). Whether a claim holds is decided here, by evidence
 * we read ourselves; the model never sets the score.
 */
export type Source = { id: string; kind: "site" | "telegram" | "x" | "github" | "token"; url: string; text: string };
export type Evidence = { id: string; label: string; state: "yes" | "no" | "unknown"; detail: string; url?: string };
export type Claim = { claim: string; quote: string; source: string; kind: "shipped" | "planned" | "partner" | "metric" | "team"; status: "backed" | "unbacked" | "contradicted"; evidence: string[] };
export type Reality = {
  token: string;
  score: number | null;
  label: string;
  why: string;
  claims: Claim[];
  evidence: Evidence[];
  sources: { id: string; kind: string; url: string; chars: number }[];
  model: boolean;
  /** claims the model named, and how many of them were found in the project's own words */
  read?: { named: number; kept: number };
  /** set when the check does not apply (an issuer stock or a base asset of the chain) */
  na?: string;
  at: number;
};

const H = { "user-agent": "Mozilla/5.0 (compatible; CorbelResearch)", accept: "text/html,application/json" };
const ADDR = /0x[0-9a-fA-F]{40}/g;

function safeUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase();
    if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    return x;
  } catch {
    return null;
  }
}

async function get(u: URL, ms = 9000): Promise<{ status: number; body: string } | null> {
  // a project's own site: public https only, every redirect checked again, cut at 1.5 MB while it streams
  const r = await safeFetch(u, { headers: H, timeoutMs: ms, maxBytes: 1_500_000 });
  return r ? { status: r.status, body: r.body.toString("utf8") } : null;
}

/** Visible text of an HTML page: no scripts, styles or tags, entities decoded, spaces folded. */
function visible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** The site's front page and up to three of its own pages that usually hold the promises: roadmap, docs, about. */
async function site(url: URL): Promise<Source[]> {
  const front = await get(url);
  if (!front || front.status >= 400) return [];
  const out: Source[] = [{ id: "site", kind: "site", url: url.href, text: visible(front.body).slice(0, 9000) }];
  const links = [...front.body.matchAll(/href="([^"#]+)"/gi)].map((m) => { try { return new URL(m[1]!, url); } catch { return null; } });
  const own = [...new Map(links.filter((u): u is URL => !!u && u.hostname === url.hostname && /roadmap|docs?|whitepaper|about|faq|token/i.test(u.pathname)).map((u) => [u.pathname, u])).values()].slice(0, 3);
  for (const [i, u] of own.entries()) {
    const r = await get(u);
    if (r && r.status < 400) out.push({ id: `site${i + 2}`, kind: "site", url: u.href, text: visible(r.body).slice(0, 6000) });
  }
  return out;
}

/** A public Telegram channel's last posts (its t.me/s/ preview), when the listed link is a channel. */
async function telegram(url: URL): Promise<Source | null> {
  const name = url.pathname.split("/").filter(Boolean)[0];
  if (!name || !/^[A-Za-z0-9_]{4,32}$/.test(name)) return null;
  const r = await get(new URL(`https://t.me/s/${name}`));
  if (!r || r.status >= 400) return null;
  const posts = [...r.body.matchAll(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g)].map((m) => visible(m[1]!)).filter(Boolean).slice(-20);
  return posts.length ? { id: "telegram", kind: "telegram", url: `https://t.me/s/${name}`, text: posts.join("\n---\n").slice(0, 7000) } : null;
}

/** The X profile: bio, age, followers and post count, plus its latest own posts when a reading session is set. */
async function xProfile(url: URL): Promise<{ source: Source | null; days: number | null; followers: number | null; posts: number | null; read: number }> {
  const handle = url.pathname.split("/").filter(Boolean)[0];
  const none = { source: null, days: null, followers: null, posts: null, read: 0 };
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return none;
  const [r, latest] = await Promise.all([get(new URL(`${process.env.SOCIAL_API_URL ?? ""}/2/profile/${handle}`)), xPosts(handle).catch(() => null)]);
  let u: { description?: string; followers?: number; statuses?: number; joined?: string } | undefined;
  try {
    u = (JSON.parse(r?.body ?? "{}") as { user?: typeof u }).user;
  } catch {}
  const days = u?.joined ? Math.floor((Date.now() - Date.parse(u.joined)) / 86_400_000) : (latest?.days ?? null);
  // the bio, then its own latest posts, each a separate block the model can quote from
  const text = [u?.description ?? "", ...(latest?.texts ?? [])].filter(Boolean).join("\n---\n").slice(0, 9000);
  if (!u && !latest?.texts.length) return none;
  return { source: text ? { id: "x", kind: "x", url: `https://x.com/${handle}`, text } : null, days: Number.isFinite(days) ? days : null, followers: u?.followers ?? latest?.followers ?? null, posts: u?.statuses ?? latest?.posts ?? null, read: latest?.texts.length ?? 0 };
}

async function github(url: URL): Promise<{ source: Source | null; ev: Evidence[] }> {
  const owner = url.pathname.split("/").filter(Boolean)[0];
  if (!owner || !/^[A-Za-z0-9-]{1,39}$/.test(owner)) return { source: null, ev: [] };
  const r = await get(new URL(`https://api.github.com/users/${owner}/repos?sort=pushed&per_page=10`));
  try {
    const repos = JSON.parse(r?.body ?? "[]") as { name: string; description: string | null; pushed_at: string; fork: boolean; size: number }[];
    if (!Array.isArray(repos)) return { source: null, ev: [] };
    const own = repos.filter((x) => !x.fork && x.size > 0);
    const last = own[0];
    const days = last ? Math.floor((Date.now() - Date.parse(last.pushed_at)) / 86_400_000) : null;
    return {
      source: own.length ? { id: "github", kind: "github", url: `https://github.com/${owner}`, text: own.map((x) => `${x.name}: ${x.description ?? ""}`).join("\n").slice(0, 3000) } : null,
      ev: [{ id: "code", label: "Code pushed in the last 30 days", state: days === null ? "no" : days <= 30 ? "yes" : "no", detail: last ? `${own.length} own repositories; ${owner}/${last.name} last pushed ${days} days ago.` : "No own public repositories.", url: `https://github.com/${owner}` }],
    };
  } catch {
    return { source: null, ev: [{ id: "code", label: "Code pushed in the last 30 days", state: "unknown", detail: "GitHub did not answer." }] };
  }
}

/**
 * What the token itself says: many launchpads write a metadata link or JSON into the contract (tokenURI(),
 * metadata()). Its description is the project's own words, and its links are often the only ones it lists.
 */
const META = parseAbi(["function tokenURI() view returns (string)", "function metadata() view returns (string)", "function contractURI() view returns (string)"]);
async function tokenMeta(token: `0x${string}`): Promise<{ text: string; links: { kind: string; url: string }[] } | null> {
  const c = getClient(process.env.RPC_URL);
  if (!c) return null;
  for (const fn of ["tokenURI", "metadata", "contractURI"] as const) {
    const v = await c.readContract({ address: token, abi: META, functionName: fn }).catch(() => null);
    if (!v || typeof v !== "string") continue;
    let m: Record<string, unknown> | null = null;
    const raw = v.trim();
    try {
      if (raw.startsWith("{")) m = JSON.parse(raw);
      else if (raw.startsWith("data:application/json")) { const b = raw.slice(raw.indexOf(",") + 1); m = JSON.parse(raw.includes(";base64,") ? Buffer.from(b, "base64").toString("utf8") : decodeURIComponent(b)); }
      else if (/^(ipfs|https):\/\//.test(raw)) { const u = raw.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${raw.slice(7).replace(/^ipfs\//, "")}` : raw; const r = await get(new URL(u)); m = r && r.status < 400 ? JSON.parse(r.body) : null; }
    } catch {
      m = null;
    }
    if (!m) continue;
    const flat = { ...m, ...((m.socials ?? m.links ?? m.properties ?? {}) as Record<string, unknown>) } as Record<string, unknown>;
    const pick = (...ks: string[]) => ks.map((k) => flat[k]).find((x): x is string => typeof x === "string" && /^https?:\/\//.test(x));
    const links = [
      { kind: "site", url: pick("website", "external_url", "site", "web", "url") },
      { kind: "twitter", url: pick("twitter", "x", "twitter_url", "x_url") },
      { kind: "telegram", url: pick("telegram", "telegram_url", "tg") },
      { kind: "github", url: pick("github") },
    ].filter((l): l is { kind: string; url: string } => !!l.url);
    const text = typeof m.description === "string" ? m.description.slice(0, 3000) : "";
    if (text || links.length) return { text, links };
  }
  return null;
}

const SYSTEM = `You read what a crypto project says about itself and list its claims. Answer with JSON only:
{"claims":[{"claim":"<the promise in plain words, under 15 words>","quote":"<the exact words from the source, copied character for character, 4 to 25 words>","source":"<source id>","kind":"shipped|planned|partner|metric|team","evidence":["<evidence ids that bear on it>"],"holds":"yes|no|unclear"}]}
Rules: list at most 12 claims, the ones a buyer relies on (a live product, contracts, partners, users, volume, a team, a roadmap item with a date).
"shipped" = says it exists now; "planned" = promises it later. Use only the evidence list to set "holds": "yes" only when an evidence item shows it,
"no" only when an evidence item contradicts it, else "unclear". Only the evidence ids code, contracts and ca can back or contradict a claim;
that a site or an account exists backs nothing. Skip slogans and anything about the X account itself. Never invent a claim, a quote or an evidence id.`;

/** Evidence that shows a deed (code shipped, contracts on the chain, this token named), the only kind that backs a claim. */
const PROOF = new Set(["code", "contracts", "ca"]);

async function extract(sources: Source[], evidence: Evidence[], said: { n: number }): Promise<Claim[] | null> {
  if (!sources.length) return null;
  await modelsReady().catch(() => undefined);
  const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY, model = briefModel();
  if (!base || !key || !model) {
    console.error("[reality] no model to read the claims");
    return null;
  }
  const user = `SOURCES\n${sources.map((s) => `[${s.id}] (${s.kind}, ${s.url})\n${s.text}`).join("\n\n")}\n\nEVIDENCE\n${evidence.map((e) => `[${e.id}] ${e.label}: ${e.state}. ${e.detail}`).join("\n")}`;
  type Part = string | { type?: string; text?: string };
  type Raw = { claims?: { claim?: string; quote?: string; source?: string; kind?: string; evidence?: string[]; holds?: string }[] };
  /** One read. The model sometimes spends its budget thinking and answers nothing, so an empty or broken answer is null. */
  const ask = async (): Promise<Raw | null> => {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: `${SYSTEM}

${user.slice(0, 24_000)}

Answer with the JSON object now.` }], max_tokens: 8000, temperature: 0 }),
      // the provider can take over half a minute even for a short answer
      signal: AbortSignal.timeout(150_000),
    }).catch((e: unknown) => (console.error("[reality] model call failed", e instanceof Error ? e.name : "error"), null));
    if (!r?.ok) {
      console.error("[reality] model answered", r?.status ?? "nothing");
      return null;
    }
    const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: Part | Part[] | null }; finish_reason?: string }[] } | null;
    const msg = j?.choices?.[0]?.message;
    // some providers answer with a list of parts instead of one string
    const parts = Array.isArray(msg?.content) ? msg.content : [msg?.content ?? ""];
    const txt = parts.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("");
    try {
      // the answer may wrap the JSON in prose or a code fence: take the outermost object
      return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as Raw;
    } catch {
      console.error("[reality] answer was not JSON:", txt.length, "chars,", j?.choices?.[0]?.finish_reason ?? "?");
      return null;
    }
  };
  const raw = (await ask()) ?? (await ask());
  if (!raw) return null;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const evIds = new Map(evidence.map((e) => [e.id, e]));
  const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9$%.]+/g, " ").trim().split(" ").filter(Boolean);
  const fold = (s: string) => words(s).join(" ");
  /** The quote is the project's words when they run in its text in order: exactly, or with at most 15% of words off. */
  const found = (quote: string, text: string) => {
    const q = words(quote), t = words(text);
    if (q.length < 3) return false;
    if (` ${t.join(" ")} `.includes(` ${q.join(" ")} `)) return true;
    for (let i = 0; i + q.length <= t.length; i++) {
      let hit = 0;
      for (let k = 0; k < q.length; k++) if (t[i + k] === q[k]) hit++;
      if (hit / q.length >= 0.85) return true;
    }
    return false;
  };
  const out: Claim[] = [];
  for (const c of raw.claims ?? []) {
    const src = c.source ? byId.get(c.source) : undefined;
    // the quote must be in the text we fetched, word for word: otherwise the claim is not the project's
    if (!src || !c.quote || !c.claim || fold(c.quote).length < 12 || !found(c.quote, src.text)) continue;
    const kind = (["shipped", "planned", "partner", "metric", "team"] as const).find((k) => k === c.kind) ?? "shipped";
    // only evidence of deeds can back or contradict a claim: that the site loads, or the X account exists, proves nothing it says
    const ev = (c.evidence ?? []).filter((id) => evIds.has(id) && PROOF.has(id));
    // backed only by an evidence item that is a "yes"; contradicted only by one that is a "no"
    const yes = ev.some((id) => evIds.get(id)!.state === "yes"), no = ev.some((id) => evIds.get(id)!.state === "no");
    const status = c.holds === "yes" && yes ? "backed" : c.holds === "no" && no ? "contradicted" : "unbacked";
    out.push({ claim: c.claim.slice(0, 140), quote: c.quote.slice(0, 220), source: src.id, kind, status, evidence: ev });
  }
  said.n = (raw.claims ?? []).length;
  console.error("[reality] named", said.n, "kept", out.length);
  return out.slice(0, 12);
}

/**
 * The score, from the evidence we read (0..100):
 *   start at 50; each shipped claim backed +8 (up to +32), each contradicted −15, each shipped or metric claim with
 *   nothing behind it −3 (up to −15); a site that names this contract +6, one that does not −8; code pushed in
 *   30 days +10; a domain or an X account under 30 days old −8 each; insiders over 20% of supply −10; a creator
 *   with drained pools −15; no site and no X at all −20.
 */
function scoreOf(claims: Claim[], ev: Evidence[]): { score: number; why: string; label: string } {
  const st = (id: string) => ev.find((e) => e.id === id)?.state;
  let s = 50;
  const backed = claims.filter((c) => c.status === "backed" && c.kind !== "planned").length;
  const contra = claims.filter((c) => c.status === "contradicted").length;
  const bare = claims.filter((c) => c.status === "unbacked" && (c.kind === "shipped" || c.kind === "metric")).length;
  s += Math.min(32, backed * 8) - contra * 15 - Math.min(15, bare * 3);
  if (st("ca") === "yes") s += 6; else if (st("ca") === "no") s -= 8;
  if (st("code") === "yes") s += 10;
  if (st("domain") === "no") s -= 8;
  if (st("x-age") === "no") s -= 8;
  if (st("insiders") === "no") s -= 10;
  if (st("dev-record") === "no") s -= 15;
  if (st("site") !== "yes" && st("x") !== "yes") s -= 20;
  s = Math.max(0, Math.min(100, Math.round(s)));
  const why = contra
    ? `${contra} claim${contra > 1 ? "s" : ""} contradicted by what is on the chain or its code.`
    : backed
      ? `${backed} of its claims ${backed > 1 ? "are" : "is"} backed by evidence${bare ? `; ${bare} with nothing behind ${bare > 1 ? "them" : "it"}` : ""}.`
      : bare
        ? `${bare} claim${bare > 1 ? "s" : ""} with nothing we could check behind ${bare > 1 ? "them" : "it"}.`
        : st("site") !== "yes" && st("x") !== "yes"
          ? "No website and no X account: there is no project to hold to its words."
          : "Little is claimed, and little can be checked.";
  return { score: s, why, label: realityLabel(s, { backed, contra }) };
}
/**
 * The word for the score. "LARP" is said only on evidence against the project (a contradicted claim, or a score pulled
 * under 20 by red flags); when nothing it says can be checked either way the honest word is "UNPROVEN".
 */
export const realityLabel = (n: number, c?: { backed: number; contra: number }) =>
  c && !c.contra && n >= 20 && (n < 40 || (!c.backed && n < 60))
    ? "UNPROVEN"
    : n >= 75 ? "REAL" : n >= 60 ? "LIKELY REAL" : n >= 40 ? "PARTLY REAL" : n >= 20 ? "LIKELY LARP" : "LARP";

export async function reality(token: `0x${string}`): Promise<Reality> {
  const t = token.toLowerCase();
  const pairs: DsPair[] = (await dsTokens([t]).catch(() => [])).filter((p) => p.baseToken.address.toLowerCase() === t);
  // an issuer's stock token or a base asset has no project to read: its issuer is checked by the trust report
  const BASES = ["0x0bd7d308f8e1639fab988df18a8011f41eacad73", "0x5fc5360d0400a0fd4f2af552add042d716f1d168"];
  const nm = pairs[0]?.baseToken.name ?? "", sym = pairs[0]?.baseToken.symbol ?? "";
  // a bridged or wrapped copy of an outside asset (cbBTC, WETH, USDC) has no promises of its own either
  const bridged = /^(w?eth|w?btc|cb[a-z]{2,5}|usd[ct](\.e)?|usdt0|eurc|dai)$/i.test(sym) || /^(wrapped|bridged|coinbase wrapped)\s/i.test(nm);
  if (BASES.includes(t) || bridged || /robinhood token/i.test(nm))
    return {
      token, score: null, label: "", why: "", claims: [], evidence: [], sources: [], model: false, at: Date.now(),
      na: BASES.includes(t) ? "A base asset of the chain: there is no project behind it to read." : bridged ? "A bridged copy of an outside asset: what stands behind it is its issuer's reserve, not a project's promises." : "An issuer's stock token: what stands behind it is the issuer and the share, not a project's promises.",
    };
  const meta = await tokenMeta(token).catch(() => null);
  const links = [...new Map([...(meta?.links ?? []), ...pairs.flatMap((p) => [...(p.info?.websites ?? []).map((w) => ({ kind: "site", url: w.url })), ...(p.info?.socials ?? []).map((s) => ({ kind: s.type, url: s.url }))])].map((l) => [l.url, l])).values()];
  const siteUrl = links.map((l) => (l.kind === "site" ? safeUrl(l.url) : null)).find(Boolean) ?? null;
  const xUrl = links.map((l) => (l.kind === "twitter" ? safeUrl(l.url.replace("twitter.com", "x.com")) : null)).find(Boolean) ?? null;
  const tgUrl = links.map((l) => (l.kind === "telegram" ? safeUrl(l.url) : null)).find(Boolean) ?? null;
  const ghUrl = links.map((l) => safeUrl(l.url)).find((u) => u?.hostname === "github.com") ?? null;

  const [siteSrc, tgSrc, xp, gh, holders] = await Promise.all([
    siteUrl ? site(siteUrl) : Promise.resolve([]),
    tgUrl ? telegram(tgUrl) : Promise.resolve(null),
    xUrl ? xProfile(xUrl) : Promise.resolve({ source: null, days: null, followers: null, posts: null, read: 0 }),
    ghUrl ? github(ghUrl) : Promise.resolve({ source: null, ev: [] as Evidence[] }),
    Promise.race([holdersOf(token).then(holdersBrief).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 15_000))]),
  ]);
  const sources = [...(meta?.text ? [{ id: "token", kind: "token" as const, url: `https://robinhoodchain.blockscout.com/token/${token}`, text: meta.text }] : []), ...siteSrc, ...(tgSrc ? [tgSrc] : []), ...(xp.source ? [xp.source] : []), ...(gh.source ? [gh.source] : [])];

  // evidence we read ourselves
  const ev: Evidence[] = [];
  ev.push({ id: "site", label: "Website answers", state: siteSrc.length ? "yes" : siteUrl ? "no" : "unknown", detail: siteUrl ? (siteSrc.length ? siteUrl.hostname : "Listed but did not load.") : "No website listed.", url: siteUrl?.href });
  if (siteSrc.length) {
    const named = siteSrc.some((s) => s.text.toLowerCase().includes(t)) || siteSrc.some((s) => s.url.toLowerCase().includes(t));
    ev.push({ id: "ca", label: "Site names this contract", state: named ? "yes" : "no", detail: named ? "This token's address is on its site." : "This token's address is not on the pages read." });
  }
  if (siteUrl) {
    const domain = siteUrl.hostname.split(".").slice(-2).join(".");
    const rd = await get(new URL(`${process.env.DOMAIN_API_URL ?? ""}/domain/${domain}`));
    let days: number | null = null;
    try {
      const reg = (JSON.parse(rd?.body ?? "{}") as { events?: { eventAction: string; eventDate: string }[] }).events?.find((e) => e.eventAction === "registration")?.eventDate;
      days = reg ? Math.floor((Date.now() - Date.parse(reg)) / 86_400_000) : null;
    } catch {}
    ev.push({ id: "domain", label: "Domain older than 30 days", state: days === null ? "unknown" : days >= 30 ? "yes" : "no", detail: days === null ? `No public registration date for ${domain}.` : `${domain} registered ${days} days ago.` });
  }
  ev.push({ id: "x", label: "X account", state: xp.source || xp.posts !== null ? "yes" : xUrl ? "unknown" : "no", detail: xUrl ? `${xp.followers ?? "?"} followers, ${xp.posts ?? "?"} posts. ${xp.read ? `Its latest ${xp.read} posts were read.` : "Its posts could not be read this time."}` : "No X account listed.", url: xUrl?.href });
  if (xp.days !== null) ev.push({ id: "x-age", label: "X account older than 30 days", state: xp.days >= 30 ? "yes" : "no", detail: `Created ${xp.days} days ago.` });
  ev.push(...gh.ev);
  ev.push({ id: "tg", label: "Public Telegram channel", state: tgSrc ? "yes" : tgUrl ? "unknown" : "no", detail: tgSrc ? "Its last posts were read." : tgUrl ? "Listed; not a public channel we can read." : "No Telegram listed.", url: tgUrl?.href });

  // contracts the project names: do they exist on the chain
  const client = getClient(process.env.RPC_URL);
  const named = [...new Set(sources.flatMap((s) => s.text.match(ADDR) ?? []).map((a) => a.toLowerCase()).filter((a) => a !== t))].slice(0, 8);
  if (client && named.length) {
    const codes = await Promise.all(named.map((a) => client.getCode({ address: a as `0x${string}` }).then((c) => !!c && c !== "0x").catch(() => null)));
    const live = codes.filter((c) => c === true).length;
    ev.push({ id: "contracts", label: "Named contracts exist on Robinhood Chain", state: live === named.length ? "yes" : live === 0 ? "no" : "unknown", detail: `${live} of ${named.length} addresses it names have code on the chain.` });
  }
  if (holders) ev.push({ id: "insiders", label: "Insiders hold under 20%", state: holders.insiders < 0.2 ? "yes" : "no", detail: `Creator, snipers and bundles hold ${(holders.insiders * 100).toFixed(1)}%; the top ten outside pools ${(holders.top10 * 100).toFixed(1)}%; ${holders.holders} holders.` });
  const origin = tokenOrigin(t);
  const hist = origin ? launcherHistory(origin.launcher) : null;
  if (hist?.checked) ev.push({ id: "dev-record", label: "Creator has no drained pools", state: hist.dead ? "no" : "yes", detail: `Launched ${hist.launches}; ${hist.dead} drained of ${hist.checked} checked.` });

  const said = { n: 0 };
  const claims = (await extract(sources, ev, said).catch(() => null)) ?? [];
  const read = { named: said.n, kept: claims.length };
  const model = claims.length > 0 || !!(process.env.AI_API_KEY && briefModel());
  const { score, why, label } = scoreOf(claims, ev);
  return { token, score: sources.length || ev.some((e) => e.state !== "unknown") ? score : null, label, why, claims, evidence: ev, sources: sources.map((s) => ({ id: s.id, kind: s.kind, url: s.url, chars: s.text.length })), model, read, at: Date.now() };
}
