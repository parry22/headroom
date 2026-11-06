import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";
import { merkleProof, merkleRoot, verifyProof } from "../src/merkle.js";

describe("merkle", () => {
  it("proofs verify for every leaf, odd and even sizes, and fail for a tampered leaf", () => {
    for (const n of [1, 2, 3, 5, 8, 20]) {
      const leaves = Array.from({ length: n }, (_, i) => keccak256(toHex(`leaf-${i}`)));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        expect(verifyProof(root, leaves[i], merkleProof(leaves, i))).toBe(true);
        expect(verifyProof(root, keccak256(toHex(`other-${i}`)), merkleProof(leaves, i))).toBe(false);
      }
    }
  });
});
