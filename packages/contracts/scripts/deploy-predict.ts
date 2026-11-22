/**
 * Deploy CorbelPredict to Robinhood Chain mainnet. OWNER-RUN ONLY.
 *
 *   DEPLOYER_KEY=0x… RESOLVER=0x<Safe> FUND=0x<fund> node --experimental-strip-types packages/contracts/scripts/deploy-predict.ts         dry run
 *   … deploy-predict.ts --yes                                                                                                                sends it
 *
 * RESOLVER must be a Safe multisig (2 of 3 suggested), never a single key: it settles price markets.
 * FUND receives the 1% fee and lost challenge bonds. CHALLENGE_BOND is in USDG units (default 100 USDG).
 * Survival markets need no resolver: the chain settles them. Reviewed in-house (docs/AUDIT-2026-11-15.md), not
 * externally audited. The key is read from this process's environment and never written anywhere.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeDeployData, formatEther, getAddress, http, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { limitedFetch } from "../../data/src/limiter.ts";

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const CHAIN_ID = 4663;

const key = process.env.DEPLOYER_KEY as Hex | undefined;
const resolver = process.env.RESOLVER ?? "";
const fund = process.env.FUND ?? "";
const bond = BigInt(Math.round(Number(process.env.CHALLENGE_BOND ?? "100") * 1e6));
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) (console.error("DEPLOYER_KEY (0x + 64 hex) is required."), process.exit(2));
if (!isAddress(resolver) || !isAddress(fund)) (console.error("RESOLVER and FUND addresses are required."), process.exit(2));
if (process.env.CHAIN_READS !== "1") (console.error("CHAIN_READS=1 is required."), process.exit(2));

const art = JSON.parse(readFileSync(new URL("../out/CorbelPredict.sol/CorbelPredict.json", import.meta.url), "utf8"));
const args = [USDG, V2_FACTORY, getAddress(fund), getAddress(resolver), bond] as const;
const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object as Hex, args });
const transport = http(process.env.RPC_URL, { fetchFn: limitedFetch, retryCount: 2 });
const pub = createPublicClient({ transport });
const account = privateKeyToAccount(key);
if ((await pub.getChainId()) !== CHAIN_ID) (console.error(`RPC is not on chain ${CHAIN_ID}. Stopping.`), process.exit(2));

// the resolver should be a contract (a Safe), not a plain key
const code = await pub.getCode({ address: getAddress(resolver) });
if (!code || code === "0x") console.warn("WARNING: RESOLVER has no code. Use a Safe multisig, not a single key.");

const [balance, gas, price] = await Promise.all([pub.getBalance({ address: account.address }), pub.estimateGas({ account: account.address, data }), pub.getGasPrice()]);
console.log(`deployer  ${account.address}`);
console.log(`balance   ${formatEther(balance)} ETH`);
console.log(`gas       ${gas} × ${price} wei ≈ ${formatEther(gas * price)} ETH`);
console.log(`args      usdg ${USDG}, factory ${V2_FACTORY}, fund ${fund}, resolver ${resolver}, bond ${Number(bond) / 1e6} USDG`);
if (!process.argv.includes("--yes")) (console.log("dry run: add --yes to send."), process.exit(0));
const wallet = createWalletClient({ account, transport, chain: { id: CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } } });
const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
console.log(`sent      ${hash}`);
const rc = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`status    ${rc.status}  block ${rc.blockNumber}`);
console.log(`predict   ${rc.contractAddress}`);
