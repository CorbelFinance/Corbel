/**
 * Dress rehearsal of the reward payout on the local test chain (a fork of Robinhood Chain, real $CORBEL token):
 * deploy CorbelDrop with the project multisig as setter, move 5M $CORBEL into it from the team wallet, build the
 * winners' list with the site's own code (lib/dropList), post the root as the multisig, let every winner claim with
 * their proof, check that a second claim and an inflated amount both fail, then move the clock past the claim window
 * and burn what was not claimed. Impersonation only works on a local fork: nothing here touches mainnet.
 *
 *   DROP_OUT=<path to out/CorbelDrop.sol/CorbelDrop.json> npx tsx scripts/drop-rehearsal.ts
 */
import { readFileSync } from "node:fs";
import { createPublicClient, encodeDeployData, encodeFunctionData, formatEther, http, parseAbi, type Hex } from "viem";
import { buildList } from "../lib/dropList";

const RPC = "http://127.0.0.1:8545";
const CORBEL = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1" as Hex;
const SAFE = "0xcAEC58545DbCEF852ac834577Cd029CD3301741b" as Hex;
const TEAM = (process.env.TEAM_WALLET ?? "") as Hex;
const DEAD = "0x000000000000000000000000000000000000dEaD" as Hex;
const c = createPublicClient({ transport: http(RPC, { timeout: 180_000 }) });
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
const DROP = parseAbi(["function post(uint256,bytes32,uint256)", "function claim(uint256,address,uint256,bytes32[])", "function burnUnclaimed(uint256)", "function allocated() view returns (uint256)"]);
const bal = async (w: Hex) => (await c.readContract({ address: CORBEL, abi: ERC20, functionName: "balanceOf", args: [w] })) as bigint;
const coins = (v: bigint) => Number(formatEther(v)).toLocaleString("en-US");

async function as(from: Hex, to: Hex | null, data: Hex): Promise<{ ok: boolean; to: Hex | null }> {
  await c.request({ method: "anvil_impersonateAccount", params: [from] } as never);
  await c.request({ method: "anvil_setBalance", params: [from, "0x56bc75e2d63100000"] } as never);
  const hash = (await c.request({ method: "eth_sendTransaction", params: [{ from, ...(to ? { to } : {}), data, gas: "0x1c9c380" }] } as never)) as Hex;
  const r = await c.waitForTransactionReceipt({ hash });
  return { ok: r.status === "success", to: r.contractAddress ?? null };
}
const check = (what: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) process.exitCode = 1;
};

if ((await c.getChainId()) !== 4663) throw new Error("not the local fork");
if (!/^0x[0-9a-fA-F]{40}$/.test(TEAM)) throw new Error("TEAM_WALLET is required");

// 1. deploy, 14-day window, the project multisig as setter
const art = JSON.parse(readFileSync(process.env.DROP_OUT!, "utf8")) as { abi: unknown[]; bytecode: { object: Hex } };
const dep = await as(TEAM, null, encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object, args: [CORBEL, SAFE, 14n * 86_400n] } as never));
const drop = dep.to!;
check(`CorbelDrop deployed at ${drop}`, dep.ok && !!drop);

// 2. the team wallet moves 5M real $CORBEL in
const teamBefore = await bal(TEAM);
const fund = await as(TEAM, CORBEL, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [drop, 5_000_000n * 10n ** 18n] }));
check(`5,000,000 $CORBEL moved in (team wallet had ${coins(teamBefore)})`, fund.ok && (await bal(drop)) === 5_000_000n * 10n ** 18n);

// 3. a week's result: 3 podium, 4 by points, 3 more drawn; built by the site's own code
const W = (n: number) => `0x${(0xa000 + n).toString(16).padStart(40, "0")}` as Hex;
const rows = [1_578_973, 1_023_138, 622_233, 193_158, 82_494, 150_000, 150_000, 150_000, 150_000, 150_000].map((total, i) => ({ wallet: W(i), total }));
const list = buildList(rows);
check(`list built: ${list.list.length} winners, ${coins(BigInt(list.total))} $CORBEL`, list.list.length === 10);

// 4. only the multisig may post; it posts round 1
const notSafe = await as(TEAM, drop, encodeFunctionData({ abi: DROP, functionName: "post", args: [1n, list.root, BigInt(list.total)] }));
check("the team wallet cannot post the list", !notSafe.ok);
const posted = await as(SAFE, drop, encodeFunctionData({ abi: DROP, functionName: "post", args: [1n, list.root, BigInt(list.total)] }));
check("the project multisig posts the list", posted.ok);

// 5. seven winners claim (anyone can send the claim; the coins always go to the winner)
for (const i of list.list.slice(0, 7)) {
  const r = await as(i.wallet as Hex, drop, encodeFunctionData({ abi: DROP, functionName: "claim", args: [1n, i.wallet as Hex, BigInt(i.amount), i.proof as Hex[]] }));
  check(`winner ${i.wallet.slice(-4)} claims ${coins(BigInt(i.amount))}`, r.ok && (await bal(i.wallet as Hex)) === BigInt(i.amount));
}
const first = list.list[0]!;
const again = await as(first.wallet as Hex, drop, encodeFunctionData({ abi: DROP, functionName: "claim", args: [1n, first.wallet as Hex, BigInt(first.amount), first.proof as Hex[]] }));
check("a second claim by the same winner fails", !again.ok);
const eight = list.list[7]!;
const greedy = await as(eight.wallet as Hex, drop, encodeFunctionData({ abi: DROP, functionName: "claim", args: [1n, eight.wallet as Hex, BigInt(eight.amount) * 2n, eight.proof as Hex[]] }));
check("claiming more than the list says fails", !greedy.ok);

// 6. past the window, the three unclaimed shares are burned
await c.request({ method: "evm_increaseTime", params: [15 * 86_400] } as never);
await c.request({ method: "evm_mine", params: [] } as never);
const late = await as(eight.wallet as Hex, drop, encodeFunctionData({ abi: DROP, functionName: "claim", args: [1n, eight.wallet as Hex, BigInt(eight.amount), eight.proof as Hex[]] }));
check("a claim after 14 days fails", !late.ok);
const dead0 = await bal(DEAD);
const burn = await as(W(99), drop, encodeFunctionData({ abi: DROP, functionName: "burnUnclaimed", args: [1n] }));
const burned = (await bal(DEAD)) - dead0;
const unclaimed = list.list.slice(7).reduce((a, i) => a + BigInt(i.amount), 0n);
check(`anyone burns the unclaimed ${coins(unclaimed)}`, burn.ok && burned === unclaimed);
check(`nothing left in the contract (${coins(await bal(drop))})`, (await bal(drop)) === 5_000_000n * 10n ** 18n - BigInt(list.total));
