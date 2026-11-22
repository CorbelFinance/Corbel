/**
 * Scrub hosts, addresses and key-like strings before a message is returned or logged:
 * URLs (an RPC URL often carries an API key in its path or query), bare hostnames with ports,
 * IPv4/IPv6 addresses and long key-like tokens.
 */
export function redact(input: unknown): string {
  // capped first: these patterns stay linear on short input, and logs never need more
  let s = (typeof input === "string" ? input : input instanceof Error ? input.message : String(input)).slice(0, 2000);
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, "[url]");
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[ip]");
  s = s.replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, "[ip]");
  s = s.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+:\d{2,5}\b/gi, "[host]");
  s = s.replace(/\b(?=[A-Za-z0-9_-]{32,}\b)(?=[^\s]*[A-Za-z])(?=[^\s]*\d)[A-Za-z0-9_-]+\b/g, (m) => (/^0x[0-9a-f]+$/i.test(m) ? m : "[secret]"));
  return s;
}
