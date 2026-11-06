/** S2 + S3: full tab lifecycle on Arc testnet. Deposit -> session key -> N tab requests -> one deliberately wrong batch challenged and
 *  refunded -> one clean batch released after the dispute window. Spends testnet USDC. Run by a human: `make settle-demo`.
 *  Env: BUYER_ARC_KEY, ARC_OPERATOR_KEY, ARC_ESCROW_ADDRESS, GATEWAY_URL, SESSION_KEY (default BUYER_ARC_KEY), TAB_REQUESTS (20), DEPOSIT_USDC (2) */
import fs from "node:fs";
import path from "node:path";
import { type Hex } from "viem";
import { Ledger } from "../../gateway/src/ledger.js";
import { ESCROW, REPO_ROOT, USDC, erc20Abi, escrowAbi, explorerTx, publicClient, send, wallet } from "./escrow.js";
import { merkleProof } from "./merkle.js";
import { postBatch } from "./post-batch.js";
import { tupleOf } from "./records.js";
import { tabRequest } from "./tab-client.js";

const GW = process.env.GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 3000}`;
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID ?? 5042002);
const N = Number(process.env.TAB_REQUESTS ?? 20);
const DEPOSIT = BigInt(Math.round(Number(process.env.DEPOSIT_USDC ?? "2") * 1e6));
if (!ESCROW || !process.env.BUYER_ARC_KEY || !process.env.ARC_OPERATOR_KEY) { console.error("need ARC_ESCROW_ADDRESS, BUYER_ARC_KEY, ARC_OPERATOR_KEY"); process.exit(2); }
const buyer = wallet(process.env.BUYER_ARC_KEY!), operator = wallet(process.env.ARC_OPERATOR_KEY!);
const sessionKey = process.env.SESSION_KEY ?? process.env.BUYER_ARC_KEY!;
const sessionAddr = wallet(sessionKey).account.address;
const out: Record<string, unknown> = { escrow: ESCROW, buyer: buyer.account.address, operator: operator.account.address, steps: [] as unknown[] };
const step = (name: string, data: unknown) => { console.log(name, JSON.stringify(data)); (out.steps as unknown[]).push({ name, ...(data as object) }); };
const read = <T,>(fn: string, args: unknown[] = []) => publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: fn as any, args: args as any }) as Promise<T>;

// 1. operator bond
const penalty = await read<bigint>("challengePenalty");
if ((await read<bigint>("operatorBond")) < penalty) {
  await send(operator, "approve", [ESCROW, penalty * 2n], USDC, erc20Abi);
  step("postBond", { amount: (penalty * 2n).toString(), tx: (await send(operator, "postBond", [penalty * 2n])).url });
}
// 2. buyer deposit + session key
await send(buyer, "approve", [ESCROW, DEPOSIT], USDC, erc20Abi);
step("deposit", { amount: DEPOSIT.toString(), tx: (await send(buyer, "deposit", [DEPOSIT])).url });
const expiry = BigInt(Math.floor(Date.now() / 1000) + 86400);
step("registerSessionKey", { key: sessionAddr, expiry: expiry.toString(), tx: (await send(buyer, "registerSessionKey", [sessionAddr, expiry])).url });
// 3. tab requests through the gateway
const ids: string[] = [];
for (let i = 0; i < N; i++) {
  const r = await tabRequest(GW, sessionKey, buyer.account.address, { messages: [{ role: "user", content: `Tab request ${i}. Reply with one word.` }], max_tokens: 8 }, ESCROW, CHAIN_ID);
  if (r.status !== 200 || !r.requestId) { step("tab_request_failed", { i, status: r.status, body: r.body.slice(0, 200) }); process.exit(1); }
  ids.push(r.requestId);
}
step("tab_requests", { count: ids.length, first: ids[0] });
// 4. deliberately wrong batch first (does not mark records as batched), then the clean batch
const wrong = await postBatch(buyer.account.address, { tamperRequestId: ids[0] });
step("postBatch_wrong", { batchId: wrong.batchId, tx: wrong.url, tamperedIndex: wrong.tamperedIndex });
const clean = await postBatch(buyer.account.address);
step("postBatch_clean", { batchId: clean.batchId, tx: clean.url });
// 5. challenge the wrong batch with the tampered leaf, its Merkle proof and the gateway's signed receipt for the same request
const ledger = new Ledger(path.resolve(REPO_ROOT, process.env.LEDGER_PATH ?? "./gateway/ledger.db"));
const rec = ledger.get(ids[0])!;
const receipt = JSON.parse(Buffer.from(rec.receipt!, "base64").toString());
const receiptTuple = { requestId: receipt.requestId as Hex, buyer: receipt.buyer, promptTokens: BigInt(receipt.promptTokens), cachedTokens: BigInt(receipt.cachedTokens), completionTokens: BigInt(receipt.completionTokens),
  rIn: BigInt(receipt.rIn), rCached: BigInt(receipt.rCached), rOut: BigInt(receipt.rOut), price: BigInt(receipt.price), timestamp: BigInt(receipt.timestamp) };
const proof = merkleProof(wrong.leaves, wrong.tamperedIndex);
const ch = await send(buyer, "challenge", [BigInt(wrong.batchId), tupleOf(wrong.fields[wrong.tamperedIndex]), proof, receiptTuple, receipt.signature]);
step("challenge", { batchId: wrong.batchId, tx: ch.url, logs: ch.rcpt.logs.length });
ledger.db.prepare(`UPDATE batch SET status='challenged' WHERE batch_id=?`).run(wrong.batchId);
// 6. wait for the clean batch window, then release
const windowS = Number(await read<bigint>("disputeWindow"));
step("waiting_window", { seconds: windowS });
await new Promise(r => setTimeout(r, (windowS + 15) * 1000));
const rel = await send(operator, "release", [BigInt(clean.batchId)]);
step("release", { batchId: clean.batchId, tx: rel.url });
ledger.db.prepare(`UPDATE batch SET status='released' WHERE batch_id=?`).run(clean.batchId);
const outPath = path.resolve(REPO_ROOT, "signer", `settle-demo-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`settle-demo: done -> ${outPath}. Now run: make reconcile`);
