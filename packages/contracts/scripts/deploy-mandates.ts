/**
 * Deploy CorbelMandates (the mandate factory) to Robinhood Chain mainnet. OWNER-RUN ONLY.
 *
 *   DEPLOYER_KEY=0x… node --experimental-strip-types packages/contracts/scripts/deploy-mandates.ts          dry run: prints the plan
 *   DEPLOYER_KEY=0x… node --experimental-strip-types packages/contracts/scripts/deploy-mandates.ts --yes    sends the transaction
 *
 * Needs CHAIN_READS=1. The key is read from the environment of this one process and never written anywhere.
 * Not audited: deploying does not mean anyone should put real money in a mandate yet.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeDeployData, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { limitedFetch } from "../../data/src/limiter.ts";

const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const CHAIN_ID = 4663;

const key = process.env.DEPLOYER_KEY as Hex | undefined;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("DEPLOYER_KEY (0x + 64 hex) is required in the environment.");
  process.exit(2);
}
if (process.env.CHAIN_READS !== "1") {
  console.error("CHAIN_READS=1 is required.");
  process.exit(2);
}

const art = JSON.parse(readFileSync(new URL("../out/CorbelMandate.sol/CorbelMandates.json", import.meta.url), "utf8"));
const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object as Hex, args: [ROUTER, PM, USDG] });
const transport = http(process.env.RPC_URL, { fetchFn: limitedFetch, retryCount: 2 });
const pub = createPublicClient({ transport });
const account = privateKeyToAccount(key);
const id = await pub.getChainId();
if (id !== CHAIN_ID) {
  console.error(`RPC is on chain ${id}, not ${CHAIN_ID}. Stopping.`);
  process.exit(2);
}
const [balance, gas, price] = await Promise.all([pub.getBalance({ address: account.address }), pub.estimateGas({ account: account.address, data }), pub.getGasPrice()]);
console.log(`deployer  ${account.address}`);
console.log(`balance   ${formatEther(balance)} ETH`);
console.log(`gas       ${gas} × ${price} wei ≈ ${formatEther(gas * price)} ETH`);
console.log(`args      router ${ROUTER}, poolManager ${PM}, bond token ${USDG}`);
if (!process.argv.includes("--yes")) {
  console.log("dry run: add --yes to send.");
  process.exit(0);
}
const wallet = createWalletClient({ account, transport, chain: { id: CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } } });
const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
console.log(`sent      ${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`status    ${rc.status}  block ${rc.blockNumber}`);
console.log(`factory   ${rc.contractAddress}`);
console.log("next: verify on robinhoodchain.blockscout.com with packages/contracts/verify/CorbelMandates.standard-input.json");
