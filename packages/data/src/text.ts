/**
 * Token names and tickers are chosen by whoever deploys the token. Strip what can deceive a reader:
 * control characters, bidirectional overrides (they can flip how an address or a price reads), zero-width
 * characters, and runs of whitespace. Length is capped. React already escapes HTML; this is about spoofing.
 */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const BAD = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\ufff9-\ufffb]/g;

export function cleanText(v: unknown, max = 64): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFKC").replace(BAD, "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
