/**
 * Local test chain for trying the contracts on localhost: a fork of Robinhood Chain on this machine (anvil, chain
 * 4663, port 8545), with Corbel's contracts deployed by a test address and test money. Nothing here touches mainnet.
 * No keys: the test address is impersonated, which only a local anvil allows.
 *
 *   anvil --fork-url <relay> --chain-id 4663 --port 8545          start the fork first (a fork lives about an hour:
 *                                                                 the RPC keeps no old state, so restart it and run this again)
 *   node --experimental-strip-types packages/contracts/scripts/devchain.ts [--out file]
 *
 * Writes the deployed addresses and the test address as JSON (default: devchain.json next to the local data).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, getAddress, http, parseEther, type Hex } from "viem";

const RPC = process.env.DEVCHAIN_RPC ?? "http://127.0.0.1:8545";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : "devchain.json";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
/** The test address that owns everything on the fork; made of a readable pattern so nobody mistakes it for a real wallet. */
export const DEV = getAddress("0xc0de000000000000000000000000000000000001");
const FUND = getAddress("0xc0de000000000000000000000000000000000002");

const pub = createPublicClient({ transport: http(RPC, { timeout: 180_000 }) });
const chain = await pub.getChainId();
if (chain !== 4663) throw new Error(`expected the local fork of chain 4663, got ${chain}`);
const w = createWalletClient({ transport: http(RPC, { timeout: 180_000 }) });
const rpc = (method: string, params: unknown[]) => pub.request({ method, params } as never);
await rpc("anvil_setBalance", [DEV, `0x${parseEther("1000000000").toString(16)}`]);
await rpc("anvil_impersonateAccount", [DEV]);

const art = (name: string) => JSON.parse(readFileSync(new URL(`../out/${name}.sol/${name}.json`, import.meta.url), "utf8")) as { abi: unknown[]; bytecode: { object: Hex } };
async function deploy(name: string, args: readonly unknown[]) {
  const a = art(name);
  const hash = await w.sendTransaction({ account: DEV, chain: null, gas: 500_000_000n, data: encodeDeployData({ abi: a.abi as never, bytecode: a.bytecode.object, args: args as never }) });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error(`${name} did not deploy`);
  console.log(name, r.contractAddress);
  return r.contractAddress;
}

// a second run keeps what is already deployed on this fork (and the orders on it) and adds only what is missing
const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, string>) : {};
const alive = async (a?: string) => !!a && ((await pub.getCode({ address: a as Hex })) ?? "0x") !== "0x";
// local events start here: logs below this block belong to the real chain
const fromBlock = prev.fromBlock ?? String(await pub.getBlockNumber());
const orders = (await alive(prev.orders)) ? prev.orders! : await deploy("CorbelOrders", [V2_ROUTER]);
const predict = (await alive(prev.predict)) ? prev.predict! : await deploy("CorbelPredict", [USDG, V2_FACTORY, FUND]);
const launchpad = (await alive(prev.launchpad)) ? prev.launchpad! : await deploy("CorbelLaunchpad", [V4_POOL_MANAGER, FUND]);
const funded = !!prev.orders && (await alive(prev.orders));

// test money: 20 ETH wrapped to WETH, and 5 ETH swapped to USDG through the real pool on the fork
const send = async (to: string, data: Hex, value = 0n) => pub.waitForTransactionReceipt({ hash: await w.sendTransaction({ account: DEV, chain: null, to: to as Hex, data, value }) });
if (!funded) await send(WETH, "0xd0e30db0", parseEther("20"));
const ROUTER = [{ type: "function", name: "swapExactETHForTokens", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "address[]" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256[]" }] }] as const;
if (!funded) await send(V2_ROUTER, encodeFunctionData({ abi: ROUTER, functionName: "swapExactETHForTokens", args: [1n, [WETH, USDG], DEV, BigInt(Math.floor(Date.now() / 1000) + 600)] }), parseEther("5"));

writeFileSync(OUT, JSON.stringify({ rpc: RPC, chainId: 4663, dev: DEV, fund: FUND, orders, predict, launchpad, fromBlock, at: new Date().toISOString() }, null, 2));
console.log("written", OUT);
