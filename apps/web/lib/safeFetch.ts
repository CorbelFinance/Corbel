/**
 * Fetching a URL that someone else chose (a token's image, a project's site): only public https hosts, every redirect
 * checked again before it is followed, and the body cut at a byte cap while it streams, never read whole first.
 * A redirect to a private address, a plain-http hop or a non-standard port is refused, so such a URL can never reach
 * this server's own services.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (carrier NAT)
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 3], // multicast and reserved
];

export function privateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ip.split(".").reduce((a, x) => (a << 8) + Number(x), 0) >>> 0;
    return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return privateAddress(m[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return false;
}

/** A URL another party chose, accepted only when it points at a public https host on the standard port. */
export function publicUrl(u: string | URL): URL | null {
  let x: URL;
  try {
    x = new URL(u);
  } catch {
    return null;
  }
  if (x.protocol !== "https:" || x.username || x.password) return null;
  if (x.port && x.port !== "443") return null;
  const h = x.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // raw IPv6 hosts are refused outright: mapped forms (::ffff:7f00:1) hide private v4 addresses, and real sites use names
  if (isIP(h) === 6) return null;
  if (isIP(h)) return privateAddress(h) ? null : x;
  if (!h.includes(".") || h === "localhost" || /\.(localhost|local|internal|lan|home|corp|onion)$/.test(h)) return null;
  return x;
}

/**
 * True when every address the URL's host resolves to is public. A name that points at a private or loopback address
 * (127.0.0.1 behind a public-looking domain) is refused, and so is a name that does not resolve.
 */
export async function resolvesPublic(u: URL): Promise<boolean> {
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(h)) return !privateAddress(h);
  try {
    const all = await lookup(h, { all: true, verbatim: true });
    return all.length > 0 && all.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}

export type SafeResponse = { status: number; url: string; type: string; body: Buffer; cut: boolean };

/** GET a URL someone else chose. Null when it is not public, a hop is refused, or the network fails. */
export async function safeFetch(u: string | URL, o: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {}): Promise<SafeResponse | null> {
  const max = o.maxBytes ?? 2_000_000;
  const deadline = AbortSignal.timeout(o.timeoutMs ?? 10_000);
  let url = publicUrl(u);
  for (let hop = 0; url && hop <= (o.maxRedirects ?? 3); hop++) {
    if (!(await resolvesPublic(url))) return null;
    let r: Response;
    try {
      r = await fetch(url, { headers: o.headers, redirect: "manual", signal: deadline });
    } catch {
      return null;
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel().catch(() => undefined);
      url = loc ? publicUrl(new URL(loc, url)) : null;
      continue;
    }
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > max) {
      await r.body?.cancel().catch(() => undefined);
      return { status: r.status, url: url.href, type: r.headers.get("content-type") ?? "", body: Buffer.alloc(0), cut: true };
    }
    const parts: Buffer[] = [];
    let size = 0, cut = false;
    const reader = r.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > max) {
            cut = true;
            parts.push(Buffer.from(value.subarray(0, value.byteLength - (size - max))));
            await reader.cancel().catch(() => undefined);
            break;
          }
          parts.push(Buffer.from(value));
        }
      } catch {
        return null;
      }
    }
    return { status: r.status, url: url.href, type: r.headers.get("content-type") ?? "", body: Buffer.concat(parts), cut };
  }
  return null;
}
