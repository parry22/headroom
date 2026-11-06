/** Sign a Mode B tab request header with a session key (EIP-712 TabRequest). Used by settle-demo and by tab buyers. */
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const TAB_TYPES = { TabRequest: [
  { name: "buyer", type: "address" }, { name: "key", type: "address" }, { name: "timestamp", type: "uint64" }, { name: "nonce", type: "string" }, { name: "bodyHash", type: "bytes32" } ] } as const;

export async function signTabHeader(sessionKey: string, buyer: Hex, bodyJson: string, escrow: Hex, chainId: number, nonce: string): Promise<string> {
  const key = privateKeyToAccount(sessionKey as Hex);
  const message = { buyer, key: key.address, timestamp: BigInt(Math.floor(Date.now() / 1000)), nonce, bodyHash: keccak256(toBytes(bodyJson)) };
  const signature = await key.signTypedData({ domain: { name: "Headroom", version: "1", chainId, verifyingContract: escrow }, types: TAB_TYPES, primaryType: "TabRequest", message });
  return Buffer.from(JSON.stringify({ ...message, timestamp: Number(message.timestamp), signature })).toString("base64");
}
export async function tabRequest(gateway: string, sessionKey: string, buyer: Hex, body: unknown, escrow: Hex, chainId: number) {
  const bodyJson = JSON.stringify(body);
  const header = await signTabHeader(sessionKey, buyer, bodyJson, escrow, chainId, crypto.randomUUID());
  const r = await fetch(`${gateway}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", "x-headroom-tab": header }, body: bodyJson });
  return { status: r.status, requestId: r.headers.get("x-headroom-request-id"), quote: Number(r.headers.get("x-headroom-quote") ?? 0), body: await r.text() };
}
