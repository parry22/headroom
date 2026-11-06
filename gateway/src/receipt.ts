/** EIP-712 receipts and Merkle leaves. Shared by the gateway (sign) and the signer/escrow (prove). */
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const RECEIPT_DOMAIN = { name: "Headroom", version: "1" } as const;
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
export function receiptSigner(privateKey: string) {
  const account = privateKeyToAccount(privateKey as Hex);
  return {
    address: account.address,
    sign: (f: ReceiptFields) => account.signTypedData({ domain: RECEIPT_DOMAIN, types: RECEIPT_TYPES, primaryType: "Receipt", message: f }),
  };
}
export function serializeReceipt(f: ReceiptFields, signature: Hex, signer: string): string {
  const plain = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  return Buffer.from(JSON.stringify({ ...plain, leaf: leafHash(f), signature, signer, domain: RECEIPT_DOMAIN })).toString("base64");
}
