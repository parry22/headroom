/** Evidence queries for the depth checker: ledger counts, external wallets, HCS mirror count, last payments. JSON on stdout. */
import { cfg } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { mirrorTopicCount } from "../src/hcs.js";

const ledger = new Ledger(cfg.ledgerPath);
const team = (process.env.TEAM_WALLETS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const done = Number((ledger.db.prepare(`SELECT COUNT(*) c FROM usage_record WHERE status='done'`).get() as any).c);
const paidHedera = ledger.paidCount();
const ext = ledger.externalStats(team);
const last = (ledger.db.prepare(`SELECT request_id, buyer, payment_tx, price, created_at FROM usage_record WHERE payment_tx IS NOT NULL ORDER BY created_at DESC LIMIT 20`).all() as any[])
  .map(r => ({ ...r, hashscan: `https://hashscan.io/${cfg.hederaNetwork}/transaction/${r.payment_tx}` }));
let hcs: number | null = null;
if (cfg.hcsTopicId) { try { hcs = await mirrorTopicCount(cfg.hcsTopicId); } catch { hcs = null; } }
let pricing: any = null;
try { pricing = await (await fetch(`${cfg.publicUrl}/pricing`, { signal: AbortSignal.timeout(3000) })).json(); } catch { pricing = null; }
console.log(JSON.stringify({
  ts: new Date().toISOString(), done_requests: done, paid_hedera_requests: paidHedera, hcs_messages: hcs, hcs_topic: cfg.hcsTopicId || null,
  external: ext, team_wallets: team, last_payments: last,
  baseline: pricing ? { ts: pricing.baseline?.ts, stale: pricing.baseline?.stale, source: pricing.baseline?.source } : null,
  checks: { P6_hcs_equals_done: hcs !== null && hcs === done, V1_external_wallets_ge_5: ext.wallets >= 5, V2_volume: ext.requests >= 200 && ext.tokens >= 2_000_000, D1_fresh_or_flagged: !!pricing && (pricing.baseline?.stale === true || (pricing.baseline?.ts && Date.now() - pricing.baseline.ts < 3_600_000)) },
}, null, 2));
