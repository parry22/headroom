/** S4: per buyer, deposited + penaltiesReceived == released + withdrawn + free + locked, from Arc events and views, exact in micro-USDC.
 *  Also cross-checks every ledger batch against a BatchPosted event. Exit 0 iff everything matches. */
import { Ledger } from "../../gateway/src/ledger.js";
import { DEPLOY_BLOCK, ESCROW, REPO_ROOT, escrowAbi, publicClient } from "./escrow.js";
import path from "node:path";
import fs from "node:fs";

if (!ESCROW) { console.error("ARC_ESCROW_ADDRESS not set"); process.exit(2); }
const ledger = new Ledger(path.resolve(REPO_ROOT, process.env.LEDGER_PATH ?? "./gateway/ledger.db"));
const latest = await publicClient.getBlockNumber();
const logs = await publicClient.getContractEvents({ address: ESCROW, abi: escrowAbi, fromBlock: DEPLOY_BLOCK, toBlock: latest });
const buyers = new Set<string>();
const ev: Record<string, bigint> = {};
const add = (k: string, v: bigint) => { ev[k] = (ev[k] ?? 0n) + v; };
const posted = new Map<string, any>();
for (const l of logs) {
  const a: any = l.args;
  switch (l.eventName) {
    case "Deposited": buyers.add(a.buyer.toLowerCase()); add(`dep:${a.buyer.toLowerCase()}`, a.amount); break;
    case "Withdrawn": add(`wd:${a.buyer.toLowerCase()}`, a.amount); break;
    case "Refunded": add(`ref:${a.buyer.toLowerCase()}`, a.amount); break;
    case "Challenged": add(`pen:${a.buyer.toLowerCase()}`, a.penalty); break;
    case "BatchPosted": posted.set(String(a.batchId), { ...a, buyer: a.buyer.toLowerCase(), tx: l.transactionHash }); break;
    case "Released": { const b = posted.get(String(a.batchId)); if (b) add(`rel:${b.buyer}`, a.amount); break; }
  }
}
let ok = true;
const rows: any[] = [];
for (const b of buyers) {
  const [free, locked, deposited, withdrawn, pen, released] = await Promise.all(
    (["free", "locked", "deposited", "withdrawn", "penaltiesReceived", "released"] as const).map(fn =>
      publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: fn, args: [b as `0x${string}`] }) as Promise<bigint>));
  const lhs = deposited + pen, rhs = released + withdrawn + free + locked;
  const viewsMatchEvents = deposited === (ev[`dep:${b}`] ?? 0n) && withdrawn === (ev[`wd:${b}`] ?? 0n) && pen === (ev[`pen:${b}`] ?? 0n) && released === (ev[`rel:${b}`] ?? 0n);
  const pass = lhs === rhs && viewsMatchEvents;
  ok &&= pass;
  rows.push({ buyer: b, deposited: deposited.toString(), penalties: pen.toString(), released: released.toString(), withdrawn: withdrawn.toString(),
    free: free.toString(), locked: locked.toString(), refunded_events: (ev[`ref:${b}`] ?? 0n).toString(), identity: `${lhs} == ${rhs}`, views_match_events: viewsMatchEvents, pass });
}
const ledgerBatches = ledger.db.prepare(`SELECT * FROM batch`).all() as any[];
const batchRows: any[] = [];
for (const lb of ledgerBatches) {
  const on = posted.get(lb.batch_id);
  const pass = !!on && on.root.toLowerCase() === lb.merkle_root.toLowerCase() && Number(on.count) === lb.record_count && on.amount === BigInt(lb.amount) && on.buyer === lb.buyer.toLowerCase();
  ok &&= pass;
  batchRows.push({ batch_id: lb.batch_id, ledger_root: lb.merkle_root, onchain_root: on?.root, ledger_amount: lb.amount, onchain_amount: on?.amount?.toString(), status: lb.status, tx: on?.tx, pass });
}
const out = { ts: new Date().toISOString(), escrow: ESCROW, block: latest.toString(), buyers: rows, batches: batchRows, pass: ok };
const outPath = path.resolve(REPO_ROOT, "signer", `reconcile-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log(`reconcile: ${ok ? "PASS" : "FAIL"} -> ${outPath}`);
process.exit(ok ? 0 : 1);
