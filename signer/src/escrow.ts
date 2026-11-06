/** viem bindings for IHeadroomEscrow on Arc testnet. ABI mirrors contracts/IHeadroomEscrow.sol. */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
loadDotenv({ path: path.join(REPO_ROOT, ".env") });

export const USDC = (process.env.ARC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as Hex;
export const ESCROW = (process.env.ARC_ESCROW_ADDRESS ?? "") as Hex;
export const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io";
export const DEPLOY_BLOCK = BigInt(process.env.ARC_ESCROW_DEPLOY_BLOCK ?? "0");

export const RECORD_TUPLE = "(bytes32 requestId,string buyer,uint64 promptTokens,uint64 cachedTokens,uint64 completionTokens,uint64 rIn,uint64 rCached,uint64 rOut,uint64 price,uint64 timestamp)";
export const escrowAbi = parseAbi([
  "event Deposited(address indexed buyer, uint256 amount)",
  "event SessionKeyRegistered(address indexed buyer, address indexed key, uint64 expiry)",
  "event BatchPosted(uint256 indexed batchId, address indexed buyer, bytes32 root, uint32 count, uint64 tokens, uint256 amount, uint256 baselineAmount, uint64 windowEnds)",
  "event Challenged(uint256 indexed batchId, address indexed buyer, bytes32 leaf, uint256 refund, uint256 penalty)",
  "event Refunded(uint256 indexed batchId, address indexed buyer, uint256 amount)",
  "event Released(uint256 indexed batchId, address indexed operator, uint256 amount)",
  "event Withdrawn(address indexed buyer, uint256 amount)",
  "event OperatorWithdrawn(address indexed operator, uint256 amount)",
  "event BondPosted(address indexed operator, uint256 amount)",
  "event BaselineSet(string gpuType, uint256 usdPerHourE6, uint256 timestamp, address by)",
  "function deposit(uint256 amount)",
  "function registerSessionKey(address key, uint64 expiry)",
  "function withdraw(uint256 amount)",
  `function challenge(uint256 batchId, ${RECORD_TUPLE} batchRecord, bytes32[] proof, ${RECORD_TUPLE} receipt, bytes receiptSig)`,
  "function postBond(uint256 amount)",
  "function postBatch(address buyer, bytes32 root, uint32 count, uint64 tokens, uint256 amount, uint256 baselineAmount) returns (uint256)",
  "function withdrawOperator(uint256 amount)",
  "function release(uint256 batchId)",
  "function setBaseline(string gpuType, uint256 usdPerHourE6, uint256 timestamp)",
  "function free(address buyer) view returns (uint256)",
  "function locked(address buyer) view returns (uint256)",
  "function deposited(address buyer) view returns (uint256)",
  "function withdrawn(address buyer) view returns (uint256)",
  "function penaltiesReceived(address buyer) view returns (uint256)",
  "function released(address buyer) view returns (uint256)",
  "function batchCount() view returns (uint256)",
  "function sessionKeyExpiry(address buyer, address key) view returns (uint64)",
  "function baseline(string gpuType) view returns (uint256 usdPerHourE6, uint256 timestamp)",
  "function operator() view returns (address)",
  "function receiptSigner() view returns (address)",
  `function receiptDigest(${RECORD_TUPLE} r) view returns (bytes32)`,
  "function operatorBond() view returns (uint256)",
  "function operatorBalance() view returns (uint256)",
  "function disputeWindow() view returns (uint64)",
  "function challengePenalty() view returns (uint256)",
]);
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address a) view returns (uint256)",
  "function allowance(address o, address s) view returns (uint256)",
]);

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
export function wallet(privateKey: string) {
  const account = privateKeyToAccount(privateKey as Hex);
  return { account, client: createWalletClient({ account, chain: arcTestnet, transport: http(RPC) }) };
}
/** Arc gas floor: maxFeePerGas must be >= 20 gwei (docs.arc.io gas-and-fees). */
export const GAS = { maxFeePerGas: 25_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n } as const;
export const explorerTx = (h: string) => `https://explorer.testnet.arc.io/tx/${h}`;

export async function send(w: ReturnType<typeof wallet>, fn: string, args: unknown[], address: Hex = ESCROW, abi: any = escrowAbi) {
  const hash = await w.client.writeContract({ address, abi, functionName: fn as any, args: args as any, ...GAS });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`${fn} reverted: ${explorerTx(hash)}`);
  return { hash, rcpt, url: explorerTx(hash) };
}
