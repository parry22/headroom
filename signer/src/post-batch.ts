/** F8: build a Merkle root over a buyer's unbatched tab records and post it to the Arc escrow.
 *  tsx src/post-batch.ts <buyer-evm-address> [--tamper <requestId>]  (tamper inflates one record's price for the dispute demo) */
import { Ledger } from "../../gateway/src/ledger.js";
import { leafHash } from "../../gateway/src/receipt.js";
import { merkleRoot } from "./merkle.js";
import { ESCROW, REPO_ROOT, escrowAbi, explorerTx, publicClient, send, wallet } from "./escrow.js";
import { leavesOf, unbatched } from "./records.js";
import path from "node:path";
import { decodeEventLog } from "viem";

export async function postBatch(buyer: string, opts: { tamperRequestId?: string; ledgerPath?: string } = {}) {
  const ledger = new Ledger(opts.ledgerPath ?? path.resolve(REPO_ROOT, process.env.LEDGER_PATH ?? "./gateway/ledger.db"));
  const records = unbatched(ledger, buyer.toLowerCase());
  if (!records.length) throw new Error(`no unbatched Mode B records for ${buyer}`);
  const { leaves, fields } = leavesOf(records);
  let tamperedLeaf: `0x${string}` | null = null, tamperedIndex = -1;
  if (opts.tamperRequestId) {
    tamperedIndex = records.findIndex(r => r.request_id === opts.tamperRequestId);
    if (tamperedIndex < 0) throw new Error("tamper record not in batch");
    fields[tamperedIndex] = { ...fields[tamperedIndex], price: fields[tamperedIndex].price * 3n + 1n };   // deliberately wrong
    leaves[tamperedIndex] = leafHash(fields[tamperedIndex]);
    tamperedLeaf = leaves[tamperedIndex];
  }
  const root = merkleRoot(leaves);
  const amount = fields.reduce((s, f) => s + f.price, 0n);
  const tokens = records.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const baselineAmount = records.reduce((s, r) => s + BigInt(r.baseline_cost ?? r.price), 0n);
  const w = wallet(process.env.ARC_OPERATOR_KEY!);
  const { hash, rcpt, url } = await send(w, "postBatch", [buyer, root, records.length, BigInt(tokens), amount, baselineAmount < amount ? amount : baselineAmount]);
  let batchId = "";
  for (const log of rcpt.logs) {
    try { const ev = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics }); if (ev.eventName === "BatchPosted") batchId = String((ev.args as any).batchId); } catch { /* other logs */ }
  }
  const b = await publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "batchCount" });
  if (!batchId) batchId = String(b - 1n);
  const windowEnds = Number((await publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "disputeWindow" })) as bigint) + Math.floor(Date.now() / 1000);
  ledger.db.prepare(`INSERT INTO batch (batch_id,buyer,merkle_root,record_count,tokens,amount,baseline_amount,post_tx,window_ends,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(batchId, buyer.toLowerCase(), root, records.length, tokens, Number(amount), Number(baselineAmount), hash, windowEnds * 1000, tamperedLeaf ? "tampered-demo" : "open", Date.now());
  if (!tamperedLeaf) for (const r of records) ledger.update(r.request_id, { batch_id: batchId });
  console.log(JSON.stringify({ batchId, buyer, root, count: records.length, tokens, amount: amount.toString(), baselineAmount: baselineAmount.toString(), tx: url, tampered: tamperedLeaf, tamperedIndex }));
  return { batchId, root, leaves, fields, records, tamperedIndex, tx: hash, url: explorerTx(hash) };
}

if (process.argv[1] && process.argv[1].endsWith("post-batch.ts")) {
  const buyer = process.argv[2]; const ti = process.argv.indexOf("--tamper");
  if (!buyer) { console.error("usage: post-batch.ts <buyer> [--tamper <requestId>]"); process.exit(2); }
  await postBatch(buyer, { tamperRequestId: ti > 0 ? process.argv[ti + 1] : undefined });
}
