/** Mode B: tab requests signed by a session key registered on the Arc escrow (PRD 7.5 Mode B). */
import { createPublicClient, http, parseAbi, verifyTypedData, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { cfg } from "./config.js";

export const TAB_TYPES = {
  TabRequest: [
    { name: "buyer", type: "address" }, { name: "key", type: "address" }, { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "string" }, { name: "bodyHash", type: "bytes32" },
  ],
} as const;
export const tabDomain = () => ({ name: "Headroom", version: "1", chainId: cfg.arcChainId, verifyingContract: cfg.arcEscrowAddress as Hex }) as const;

export interface TabHeader { buyer: Hex; key: Hex; timestamp: number; nonce: string; bodyHash: Hex; signature: Hex }
export function parseTabHeader(h: string): TabHeader { return JSON.parse(Buffer.from(h, "base64").toString()); }

export interface EscrowReader { sessionKeyExpiry(buyer: Hex, key: Hex): Promise<bigint>; free(buyer: Hex): Promise<bigint> }
const abi = parseAbi(["function sessionKeyExpiry(address buyer, address key) view returns (uint64)", "function free(address buyer) view returns (uint256)"]);
export function chainEscrowReader(): EscrowReader {
  const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io") });
  const addr = cfg.arcEscrowAddress as Hex;
  return {
    sessionKeyExpiry: (buyer, key) => client.readContract({ address: addr, abi, functionName: "sessionKeyExpiry", args: [buyer, key] }) as Promise<bigint>,
    free: buyer => client.readContract({ address: addr, abi, functionName: "free", args: [buyer] }) as Promise<bigint>,
  };
}

export async function verifyTab(t: TabHeader, bodyHash: Hex, reader: EscrowReader, outstandingMicro: number, quoteMicro: number, now = Date.now()):
  Promise<{ ok: true } | { ok: false; reason: string; detail?: Record<string, unknown> }> {
  if (!cfg.arcEscrowAddress) return { ok: false, reason: "tab_not_configured" };
  if (t.bodyHash?.toLowerCase() !== bodyHash.toLowerCase()) return { ok: false, reason: "body_hash_mismatch" };
  if (Math.abs(now / 1000 - t.timestamp) > 300) return { ok: false, reason: "tab_timestamp_skew" };
  const valid = await verifyTypedData({ address: t.key, domain: tabDomain(), types: TAB_TYPES, primaryType: "TabRequest",
    message: { buyer: t.buyer, key: t.key, timestamp: BigInt(t.timestamp), nonce: t.nonce, bodyHash: t.bodyHash }, signature: t.signature }).catch(() => false);
  if (!valid) return { ok: false, reason: "bad_tab_signature" };
  const expiry = await reader.sessionKeyExpiry(t.buyer, t.key);
  if (Number(expiry) * 1000 <= now) return { ok: false, reason: "session_key_not_registered_or_expired", detail: { expiry: Number(expiry) } };
  const free = await reader.free(t.buyer);
  if (free < BigInt(outstandingMicro + quoteMicro)) return { ok: false, reason: "tab_insufficient_free_balance", detail: { free: free.toString(), outstanding: outstandingMicro, quote: quoteMicro } };
  return { ok: true };
}
