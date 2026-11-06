/** EIP-712 receipts and Merkle leaves. Shared by the gateway (sign) and the signer/escrow (prove). */
import { encodeAbiParameters, hashTypedData, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface ReceiptDomain { name: "Headroom"; version: "1"; chainId?: number; verifyingContract?: Hex }
/** The escrow verifies receipts under {name, version, chainId, verifyingContract: escrow} (contracts/ESCROW-SPEC.md).
 *  Pass the Arc chain id and escrow address once the escrow is deployed; without them receipts are signed under {name, version}
 *  and stay verifiable off-chain but cannot be used in an on-chain challenge. */
export function receiptDomain(chainId?: number, verifyingContract?: string): ReceiptDomain {
  if (!verifyingContract) return { name: "Headroom", version: "1" };
  return { name: "Headroom", version: "1", chainId: chainId ?? 5042002, verifyingContract: verifyingContract as Hex };
}
export const RECEIPT_DOMAIN = receiptDomain();
export const RECEIPT_TYPES = {
  Receipt: [
    { name: "requestId", type: "bytes32" }, { name: "buyer", type: "string" },
    { name: "promptTokens", type: "uint64" }, { name: "cachedTokens", type: "uint64" }, { name: "completionTokens", type: "uint64" },
    { name: "rIn", type: "uint64" }, { name: "rCached", type: "uint64" }, { name: "rOut", type: "uint64" },
    { name: "price", type: "uint64" }, { name: "timestamp", type: "uint64" },
  ],
} as const;
export interface ReceiptFields {
  requestId: Hex; buyer: string; promptTokens: bigint; cachedTokens: bigint; completionTokens: bigint;
  rIn: bigint; rCached: bigint; rOut: bigint; price: bigint; timestamp: bigint;
}
export function requestIdHash(requestId: string): Hex { return keccak256(new TextEncoder().encode(requestId)); }

/** Leaf = keccak256(abi.encode(fields)); the escrow contract recomputes the same hash in challenge(). */
export function leafHash(f: ReceiptFields): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "string" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" },
     { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
    [f.requestId, f.buyer, f.promptTokens, f.cachedTokens, f.completionTokens, f.rIn, f.rCached, f.rOut, f.price, f.timestamp]));
}
export function receiptSigner(privateKey: string, domain: ReceiptDomain = RECEIPT_DOMAIN) {
  const account = privateKeyToAccount(privateKey as Hex);
  return {
    address: account.address,
    domain,
    sign: (f: ReceiptFields) => account.signTypedData({ domain, types: RECEIPT_TYPES, primaryType: "Receipt", message: f }),
  };
}
/** EIP-712 digest of a receipt; must equal the escrow's receiptDigest(record) for an on-chain challenge to verify. */
export function receiptDigest(f: ReceiptFields, domain: ReceiptDomain = RECEIPT_DOMAIN): Hex {
  return hashTypedData({ domain, types: RECEIPT_TYPES, primaryType: "Receipt", message: f });
}
export function serializeReceipt(f: ReceiptFields, signature: Hex, signer: string, domain: ReceiptDomain = RECEIPT_DOMAIN): string {
  const plain = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  return Buffer.from(JSON.stringify({ ...plain, leaf: leafHash(f), signature, signer, domain })).toString("base64");
}
