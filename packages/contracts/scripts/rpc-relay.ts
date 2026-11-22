/**
 * Local JSON-RPC relay for forked tests: anvil / forge talk to http://127.0.0.1:8547, and this process
 * forwards each request to RPC_URL through the shared rate limiter. Starts only with CHAIN_READS=1.
 * Read-only methods only; anything that would send a transaction is refused.
 */
import http from "node:http";
import { limitedFetch } from "../../data/src/limiter.ts";

const PORT = Number(process.env.RELAY_PORT ?? 8547);
const RPC = process.env.RPC_URL;
const REFUSE = new Set(["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "personal_sign", "eth_signTransaction", "eth_signTypedData_v4"]);

if (process.env.CHAIN_READS !== "1" || !RPC) {
  console.error("[relay] CHAIN_READS=1 and RPC_URL are required: not starting.");
  process.exit(2);
}

const refused = (body: unknown): boolean => {
  const list = Array.isArray(body) ? body : [body];
  return list.some((r) => REFUSE.has((r as { method?: string })?.method ?? ""));
};

http
  .createServer(async (req, res) => {
    if (req.method !== "POST") return void res.writeHead(405).end();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      if (refused(JSON.parse(raw))) return void res.writeHead(403, { "content-type": "application/json" }).end('{"error":"relay is read-only"}');
      const up = await limitedFetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: raw });
      res.writeHead(up.status, { "content-type": "application/json" }).end(Buffer.from(await up.arrayBuffer()));
    } catch {
      res.writeHead(502).end();
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[relay] 127.0.0.1:${PORT} → RPC`));
