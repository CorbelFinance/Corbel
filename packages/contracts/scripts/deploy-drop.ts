/**
 * Deploy CorbelDrop (the reward season's payout contract) to Robinhood Chain mainnet. OWNER-RUN ONLY.
 *
 *   DEPLOYER_KEY=0x… SETTER=0x<project multisig> node --experimental-strip-types packages/contracts/scripts/deploy-drop.ts      dry run
 *   … deploy-drop.ts --yes                                                                                                       sends it
 *
 * Token: $CORBEL. SETTER posts each week's Merkle root (the project's multisig). CLAIM_DAYS (default 14): after that,
 * whatever was not claimed is burned. The contract has no withdraw. The key is read from this process's environment
 * and never written anywhere. Reviewed in-house with tests (test/CorbelDrop.t.sol), not externally audited.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeDeployData, formatEther, getAddress, http, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { limitedFetch } from "../../data/src/limiter.ts";

const CORBEL = "0xaa1f4de6b9f7cdf11fb8aa97ce163d35d731cdb1";
const CHAIN_ID = 4663;
const key = process.env.DEPLOYER_KEY as Hex | undefined;
const setter = process.env.SETTER ?? "";
const days = Number(process.env.CLAIM_DAYS ?? "14");
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) (console.error("DEPLOYER_KEY (0x + 64 hex) is required."), process.exit(2));
if (!isAddress(setter)) (console.error("SETTER (the project multisig address) is required."), process.exit(2));
if (!(days >= 1 && days <= 60)) (console.error("CLAIM_DAYS must be 1 to 60."), process.exit(2));
if (process.env.CHAIN_READS !== "1") (console.error("CHAIN_READS=1 is required."), process.exit(2));

const art = JSON.parse(readFileSync(new URL("../out/CorbelDrop.sol/CorbelDrop.json", import.meta.url), "utf8"));
const args = [getAddress(CORBEL), getAddress(setter), BigInt(days * 86_400)] as const;
const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object as Hex, args });
const transport = http(process.env.RPC_URL, { fetchFn: limitedFetch, retryCount: 2 });
const pub = createPublicClient({ transport });
if ((await pub.getChainId()) !== CHAIN_ID) (console.error("The RPC is not Robinhood Chain."), process.exit(2));
const account = privateKeyToAccount(key);
const [balance, gas, price] = await Promise.all([pub.getBalance({ address: account.address }), pub.estimateGas({ account: account.address, data }), pub.getGasPrice()]);
console.log(`deployer  ${account.address}`);
console.log(`balance   ${formatEther(balance)} ETH`);
console.log(`gas       ${gas} × ${price} wei ≈ ${formatEther(gas * price)} ETH`);
console.log(`args      token ${CORBEL}, setter ${setter}, claim window ${days} days`);
if (!process.argv.includes("--yes")) (console.log("dry run: add --yes to send."), process.exit(0));
const wallet = createWalletClient({ account, transport, chain: { id: CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } } });
const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
console.log(`sent      ${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`status    ${rc.status}  block ${rc.blockNumber}`);
console.log(`drop      ${rc.contractAddress}`);
