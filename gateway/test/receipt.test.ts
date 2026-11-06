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
