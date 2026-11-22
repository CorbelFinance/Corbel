import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stockCandidates } from "@corbel/indexer";
import { getClient } from "@corbel/data/chain";
import { parseAbi } from "viem";
import { guardWait } from "@/lib/guard";
import { padArt, padArtReady } from "@/lib/padArt";
import { keepLogos } from "@/lib/logoKeeper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/logo?a=<token address>&s=<symbol>&stock=1 → the token's own logo, served from this site.
 * Stock tokens: the company logo by ticker (a public logo set). Other tokens: the image
 * the project set on the pairs index for Robinhood Chain. Fetched once by the server, kept on disk; the browser
 * never calls a third party. 404 when there is none (the page then draws its own avatar).
 */
const DIR = process.env.CORBEL_DB ? join(dirname(resolve(/*turbopackIgnore: true*/ process.env.CORBEL_DB)), "logos") : resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "data", "logos");
const MISS_TTL = 2 * 3600_000;
const MAX_BYTES = 6_000_000; // a big original is shrunk to an avatar before it is kept
const KEEP_PX = 128;
const inflight = new Map<string, Promise<Buffer | null>>();

async function fetchOnce(url: string): Promise<Buffer | null> {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  const type = r.headers.get("content-type") ?? "";
  const b = Buffer.from(await r.arrayBuffer());
  // some gateways send images as octet-stream: trust the bytes, not the header
  if (!/^image\/(png|jpeg|webp|gif)/.test(type) && !typeOf(b)) return null;
  return b.length > 0 && b.length <= MAX_BYTES ? shrink(b) : null;
}
/** Every logo is kept as a small square WebP: the avatar never shows more than about 64 px. */
async function shrink(b: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(b, { animated: false }).resize(KEEP_PX, KEEP_PX, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    return b.length <= 400_000 ? b : Buffer.alloc(0);
  }
}
/** IPFS content is the same on every gateway: try a few, since a single one can be slow. */
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.filebase.io/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/", "https://nftstorage.link/ipfs/", "https://4everland.io/ipfs/"];
async function fetchImage(url: string): Promise<Buffer | null> {
  const m = url.match(/\/ipfs\/(.+)$/) ?? url.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/);
  if (!m) return fetchOnce(url);
  for (const g of GATEWAYS) {
    const b = await fetchOnce(g + m[1]);
    if (b) return b;
  }
  return null;
}

/** Base assets: their official logos by address, never a project-set image that could be anyone's. */
const KNOWN: Record<string, string> = {
  "0x0000000000000000000000000000000000000000": `${process.env.LOGO_BASE_URL ?? ""}/coins/images/279/large/ethereum.png`,
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": `${process.env.LOGO_BASE_URL ?? ""}/coins/images/2518/large/weth.png`,
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": `${process.env.LOGO_BASE_URL ?? ""}/coins/images/51281/large/GDN_USDG_Token_200x200.png`,
};

/** Stock tokens by address, from our own index; a stock token always gets its company's logo, whatever list asked. */
const SG = globalThis as unknown as { __corbelStocks?: { at: number; map: Map<string, string> } };
function stockSymbol(a: string): string | null {
  if (!SG.__corbelStocks || Date.now() - SG.__corbelStocks.at > 10 * 60_000) {
    const rows = stockCandidates(500) ?? [];
    SG.__corbelStocks = { at: Date.now(), map: new Map(rows.map((r) => [r.address.toLowerCase(), r.symbol.toUpperCase().replace(/[^A-Z.]/g, "")])) };
  }
  return SG.__corbelStocks.map.get(a) ?? null;
}
const stockLogo = (s: string) => fetchImage(`${process.env.STOCK_LOGO_URL ?? ""}/image-stock/${s.replace(".", "-")}.png`);

async function find(a: string, s: string, stock: boolean): Promise<Buffer | null> {
  if (KNOWN[a]) return fetchImage(KNOWN[a]);
  const indexed = stockSymbol(a);
  if (indexed && /^[A-Z.]{1,6}$/.test(indexed)) {
    const b = await stockLogo(indexed);
    if (b) return b;
  }
  if (stock && /^[A-Z.]{1,6}$/.test(s)) {
    const b = await stockLogo(s);
    if (b) return b;
  }
  // the launchpad's own artwork for its tokens
  padArt(DIR, a);
  await padArtReady();
  const art = padArt(DIR, a);
  if (art) {
    const b = await fetchImage(art).catch(() => null);
    if (b) return b;
  }
  const r = await fetch(`${process.env.PAIRS_API_URL ?? ""}/tokens/v1/robinhood/${a}`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { info?: { imageUrl?: string } }[];
  const url = j.find((p) => p.info?.imageUrl)?.info?.imageUrl;
  if (url && url.startsWith("https://")) {
    const b = await fetchImage(url);
    if (b) return b;
  }
  const own = await fromOwnFields(a);
  if (own) return own;
  const t = await fromTokenUri(a);
  if (t) return t;
  return fromIndexImage(a);
}

/**
 * A public token index that keeps token images. Calls go through one queue, 2.2 s apart.
 */
let gtNext = 0;
async function fromIndexImage(a: string): Promise<Buffer | null> {
  const wait = Math.max(0, gtNext - Date.now());
  gtNext = Math.max(Date.now(), gtNext) + 2200;
  if (wait > 30_000) return null; // a long queue: the keeper retries later
  await new Promise((r) => setTimeout(r, wait));
  const r = await fetch(`${process.env.TOKEN_INDEX_URL ?? ""}/api/v2/networks/robinhood/tokens/${a}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { data?: { attributes?: { image_url?: string | null } } } | null;
  const u = j?.data?.attributes?.image_url;
  return u && u.startsWith("https://") ? fetchImage(u).catch(() => null) : null;
}

/**
 * Many launchpads write the token's metadata link into the token itself: tokenURI() returns ipfs://, https:// or a
 * data: URL with JSON, and the JSON's "image" is the logo. Read it from the chain, then fetch the image.
 */
const TURI = parseAbi(["function tokenURI() view returns (string)"]);
/** Launchpads that keep the picture in a function of its own: Pons logo(), Clanker imageUrl()/image(), metadata() JSON. */
const OWN = parseAbi(["function logo() view returns (string)", "function imageUrl() view returns (string)", "function image() view returns (string)", "function metadata() view returns (string)"]);
async function fromOwnFields(a: string): Promise<Buffer | null> {
  const c = getClient(process.env.RPC_URL);
  if (!c) return null;
  for (const fn of ["logo", "imageUrl", "image", "metadata"] as const) {
    const v = await c.readContract({ address: a as `0x${string}`, abi: OWN, functionName: fn }).catch(() => null);
    if (!v || typeof v !== "string") continue;
    let url: string | null = v.trim();
    if (url.startsWith("{")) {
      try {
        const m = JSON.parse(url) as Record<string, unknown>;
        url = ["image", "imageUrl", "image_url", "logo", "icon"].map((k) => m[k]).find((x): x is string => typeof x === "string" && x.length > 0) ?? null;
      } catch {
        url = null;
      }
    }
    if (url && /^(ipfs|https):\/\//.test(url)) {
      const b = await fetchImage(url).catch(() => null);
      if (b) return b;
    }
  }
  return null;
}
const ipfs = (u: string) => (u.startsWith("ipfs://") ? `https://gateway.pinata.cloud/ipfs/${u.slice(7).replace(/^ipfs\//, "")}` : u);
async function fromTokenUri(a: string): Promise<Buffer | null> {
  const c = getClient(process.env.RPC_URL);
  if (!c) return null;
  const uri = await c.readContract({ address: a as `0x${string}`, abi: TURI, functionName: "tokenURI" }).catch(() => null);
  if (!uri || typeof uri !== "string") return null;
  let meta: Record<string, unknown> | null = null;
  if (uri.startsWith("data:application/json")) {
    const body = uri.slice(uri.indexOf(",") + 1);
    try {
      meta = JSON.parse(uri.includes(";base64,") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body)) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (/^(ipfs|https):\/\//.test(uri)) {
    const r = await fetch(ipfs(uri), { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    // some point straight at the picture
    if (/^image\/(png|jpeg|webp|gif)/.test(type)) {
      const b = Buffer.from(await r.arrayBuffer());
      return b.length > 0 && b.length <= MAX_BYTES ? b : null;
    }
    meta = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  }
  // launchpads name the field differently: image, image_hash (Doppler), imageUrl, logo, icon
  const img = ["image", "image_hash", "imageUrl", "image_url", "logo", "icon"].map((k) => meta?.[k]).find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  if (!img || !/^(ipfs|https):\/\//.test(img)) return null;
  return fetchImage(ipfs(img)).catch(() => null);
}

/** First bytes → content type; anything else is refused. */
function typeOf(b: Buffer) {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.subarray(0, 4).toString() === "RIFF") return "image/webp";
  if (b.subarray(0, 3).toString() === "GIF") return "image/gif";
  return null;
}

async function handle(req: Request) {
  const u = new URL(req.url);
  const a = (u.searchParams.get("a") ?? "").toLowerCase();
  const s = (u.searchParams.get("s") ?? "").toUpperCase().replace(/[^A-Z.]/g, "");
  const stock = u.searchParams.get("stock") === "1";
  if (!/^0x[0-9a-f]{40}$/.test(a)) return new Response(null, { status: 400 });
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  // base assets keep their own cache names, so an image saved earlier from another source is never served
  const name = KNOWN[a] ? `base-${a}` : a;
  const file = join(DIR, `${name}.img`), miss = join(DIR, `${name}.miss8`);
  const send = (b: Buffer) => new Response(new Uint8Array(b), { headers: { "content-type": typeOf(b) ?? "application/octet-stream", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
  if (existsSync(file)) return send(readFileSync(file));
  if (existsSync(miss) && Date.now() - statSync(miss).mtimeMs < MISS_TTL) return drawn(a);
  let p = inflight.get(a);
  if (!p) {
    p = find(a, s, stock).catch(() => null);
    inflight.set(a, p);
  }
  const b = await p;
  inflight.delete(a);
  if (b && typeOf(b)) {
    writeFileSync(file, b);
    return send(b);
  }
  writeFileSync(miss, "");
  return drawn(a);
}

/**
 * No picture anywhere for this token: draw one from its address (a mirrored 5x5 pattern in the token's own hue), so
 * every token always has a mark of its own and the page never shows a broken image.
 */
function drawn(a: string) {
  let h = 0;
  for (let i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) % 360;
  const hex = a.replace(/^0x/, "");
  const cells: string[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++)
      if (parseInt(hex[(y * 3 + x) * 2 % hex.length] ?? "0", 16) % 2 === 0)
        for (const cx of x < 2 ? [x, 4 - x] : [x]) cells.push(`<rect x="${cx + 1}" y="${y + 1}" width="1.02" height="1.02" fill="hsl(${h} 75% ${55 + ((cx + y) % 3) * 8}%)"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><defs><radialGradient id="g" cx="30%" cy="25%"><stop offset="0" stop-color="hsl(${h} 45% 20%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 50% 10%)"/></radialGradient></defs><circle cx="3.5" cy="3.5" r="3.5" fill="url(#g)"/>${cells.join("")}</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "x-logo": "drawn" } });
}

export async function GET(req: Request) {
  keepLogos();
  const g = await guardWait(req, "logo");
  if ("blocked" in g) return g.blocked;
  try {
    return await handle(req);
  } finally {
    g.release();
  }
}
