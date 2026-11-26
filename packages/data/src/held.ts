/**
 * Which of many tokens a wallet holds, in few calls. The probe below runs inside one eth_call and is never deployed: it
 * asks every token for the wallet's balance with a fixed gas limit each and returns only the balances above zero.
 * Source (solc 0.8.26, optimizer on, evm paris):
 *
 * contract HeldProbe {
 *     constructor(address who, bytes memory tokens) {
 *         assembly {
 *             let n := div(mload(tokens), 20)
 *             let src := add(tokens, 32)
 *             let out := mload(0x40)
 *             let len := 0
 *             let data := add(out, mul(n, 34))
 *             mstore(data, 0x70a0823100000000000000000000000000000000000000000000000000000000)
 *             mstore(add(data, 4), who)
 *             for { let i := 0 } lt(i, n) { i := add(i, 1) } {
 *                 let t := shr(96, mload(add(src, mul(i, 20))))
 *                 mstore(0, 0)
 *                 let ok := staticcall(120000, t, data, 36, 0, 32)
 *                 if and(ok, gt(returndatasize(), 31)) {
 *                     let v := mload(0)
 *                     if v {
 *                         mstore(add(out, len), shl(240, i))
 *                         mstore(add(out, add(len, 2)), v)
 *                         len := add(len, 34)
 *                     }
 *                 }
 *             }
 *             return(out, len)
 *         }
 *     }
 * }
 */
import { concat, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";

const PROBE = "0x608060405234801561001057600080fd5b506040516101ba3803806101ba83398101604081905261002f916100cd565b60148151046020820160405160006022840282016370a0823160e01b815286600482015260005b858110156100b1576014810285015160601c6000805260206000602485846201d4c0fa9050601f3d118116156100a85760005180156100a6578260f01b8587015280600286018701526022850194505b505b50600101610056565b50508082f35b634e487b7160e01b600052604160045260246000fd5b600080604083850312156100e057600080fd5b82516001600160a01b03811681146100f757600080fd5b60208401519092506001600160401b0381111561011357600080fd5b8301601f8101851361012457600080fd5b80516001600160401b0381111561013d5761013d6100b7565b604051601f8201601f19908116603f011681016001600160401b038111828210171561016b5761016b6100b7565b60405281815282820160200187101561018357600080fd5b60005b828110156101a257602081850181015183830182015201610186565b50600060208383010152809350505050925092905056fe" as Hex;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
const BAL = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const MC = [{ type: "function", name: "aggregate3", stateMutability: "payable", inputs: [{ name: "calls", type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }] }], outputs: [{ type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }] }] as const;
/** The code and its arguments must stay under the 49,152-byte limit on init code: 1,800 tokens are 36 KB. */
const PER_CALL = 1_800;

/**
 * Asks again when a read is refused or lost, then fails. The node keeps only the last ~128 blocks of state (about 13
 * seconds), so balances are read at the latest block: pinned to the block a long read started at they are refused, and
 * a refusal taken for zero makes holdings vanish.
 */
export async function again<T>(f: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

/** Reads the probe's answer: packed (uint16 index, uint256 balance). */
export function unpackHeld(data: string, tokens: string[]): [string, bigint][] {
  const h = data.replace(/^0x/, "");
  const out: [string, bigint][] = [];
  for (let i = 0; i + 68 <= h.length; i += 68) {
    const t = tokens[parseInt(h.slice(i, i + 4), 16)];
    const v = BigInt(`0x${h.slice(i + 4, i + 68)}`);
    if (t && v > 0n) out.push([t, v]);
  }
  return out;
}

async function multicall(client: PublicClient, who: Address, list: string[]): Promise<[string, bigint][]> {
  const callData = encodeFunctionData({ abi: BAL, functionName: "balanceOf", args: [who] });
  const r = await client.call({ to: MULTICALL3, data: encodeFunctionData({ abi: MC, functionName: "aggregate3", args: [list.map((t) => ({ target: t as Address, allowFailure: true, callData }))] }) });
  const d = decodeFunctionResult({ abi: MC, functionName: "aggregate3", data: r.data! }) as readonly { success: boolean; returnData: Hex }[];
  return d.flatMap((x, i) => (x.success && x.returnData.length >= 66 && BigInt(x.returnData.slice(0, 66)) > 0n ? [[list[i]!, BigInt(x.returnData.slice(0, 66))] as [string, bigint]] : []));
}

/** Balances above zero among `tokens` (lower-cased addresses). A part the node refuses is halved, then read by multicall. */
export async function heldOf(client: PublicClient, who: Address, tokens: string[], opts: { lanes?: number } = {}): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const read = async (list: string[], depth = 0): Promise<void> => {
    try {
      const args = encodeAbiParameters([{ type: "address" }, { type: "bytes" }], [who, concat(list as Hex[])]);
      const r = await again(() => client.call({ data: concat([PROBE, args]) }), depth === 0 ? 2 : 1);
      for (const [t, v] of unpackHeld(r.data ?? "0x", list)) out.set(t, v);
    } catch (e) {
      if (list.length > 200 && depth < 4) {
        const m = list.length >> 1;
        await Promise.all([read(list.slice(0, m), depth + 1), read(list.slice(m), depth + 1)]);
        return;
      }
      if (list.length > 200) throw e;
      for (const [t, v] of await again(() => multicall(client, who, list))) out.set(t, v);
    }
  };
  const parts: string[][] = [];
  for (let i = 0; i < tokens.length; i += PER_CALL) parts.push(tokens.slice(i, i + PER_CALL));
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(opts.lanes ?? 4, parts.length) }, async () => {
    while (i < parts.length) await read(parts[i++]!);
  }));
  return out;
}
