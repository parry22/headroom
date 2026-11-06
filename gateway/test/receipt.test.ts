import { describe, expect, it } from "vitest";
import { verifyTypedData } from "viem";
import { RECEIPT_DOMAIN, RECEIPT_TYPES, leafHash, receiptSigner, requestIdHash } from "../src/receipt.js";

describe("receipt", () => {
  it("signs an EIP-712 receipt that verifies against the published signer, and leaf hashes are stable", async () => {
    const s = receiptSigner("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const f = { requestId: requestIdHash("req-1"), buyer: "0.0.1234", promptTokens: 30000n, cachedTokens: 20000n, completionTokens: 256n,
      rIn: 1_000_000n, rCached: 250_000n, rOut: 4_000_000n, price: 31024n, timestamp: 1_800_000_000n };
    const sig = await s.sign(f);
    expect(await verifyTypedData({ address: s.address, domain: RECEIPT_DOMAIN, types: RECEIPT_TYPES, primaryType: "Receipt", message: f, signature: sig })).toBe(true);
    expect(leafHash(f)).toBe(leafHash({ ...f }));
    expect(leafHash(f)).not.toBe(leafHash({ ...f, price: 31025n }));
  });
});

describe("receipt domain", () => {
  it("binds to the escrow (chainId + verifyingContract) once configured, so the on-chain digest differs from the bare domain", async () => {
    const { receiptDomain, receiptDigest } = await import("../src/receipt.js");
    const escrow = "0x1111111111111111111111111111111111111111";
    const f = { requestId: requestIdHash("req-2"), buyer: "0xabc", promptTokens: 1n, cachedTokens: 0n, completionTokens: 1n,
      rIn: 1n, rCached: 1n, rOut: 1n, price: 1n, timestamp: 1n };
    expect(receiptDomain()).toEqual({ name: "Headroom", version: "1" });
    const d = receiptDomain(5042002, escrow);
    expect(d).toEqual({ name: "Headroom", version: "1", chainId: 5042002, verifyingContract: escrow });
    expect(receiptDigest(f, d)).not.toBe(receiptDigest(f));
    const s = receiptSigner("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", d);
    expect(await verifyTypedData({ address: s.address, domain: d, types: RECEIPT_TYPES, primaryType: "Receipt", message: f, signature: await s.sign(f) })).toBe(true);
  });
});
