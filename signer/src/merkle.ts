/** Sorted-pair keccak256 Merkle tree over leaf hashes, compatible with OpenZeppelin MerkleProof.verify. No double hashing. */
import { concat, keccak256, type Hex } from "viem";

const pair = (a: Hex, b: Hex): Hex => (a.toLowerCase() < b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) throw new Error("empty tree");
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}
export function merkleProof(leaves: Hex[], index: number): Hex[] {
  if (index < 0 || index >= leaves.length) throw new Error("bad index");
  const proof: Hex[] = [];
  let level = [...leaves];
  let i = index;
  while (level.length > 1) {
    const sib = i ^ 1;
    if (sib < level.length) proof.push(level[sib]);
    const next: Hex[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(j + 1 < level.length ? pair(level[j], level[j + 1]) : level[j]);
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}
export function verifyProof(root: Hex, leaf: Hex, proof: Hex[]): boolean {
  let h = leaf;
  for (const p of proof) h = pair(h, p);
  return h.toLowerCase() === root.toLowerCase();
}
