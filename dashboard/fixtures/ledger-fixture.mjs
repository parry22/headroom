// Builds a tiny sample ledger (same schema as gateway/src/ledger.ts) with three usage
// records and one batch. Used only when DASHBOARD_FIXTURES=1 and the real ledger is missing.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS usage_record (
    request_id TEXT PRIMARY KEY, mode TEXT NOT NULL, buyer TEXT NOT NULL, model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL, quoted_prompt_tokens INTEGER NOT NULL, cached_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
    max_tokens INTEGER NOT NULL, tier_l1_delta INTEGER, tier_l2_delta INTEGER, kv_bytes_peak INTEGER,
    ttft_ms REAL, latency_ms REAL, gpu_seconds REAL, unit_prices TEXT NOT NULL, price INTEGER NOT NULL,
    actual_cost INTEGER, baseline_cost INTEGER, payment_tx TEXT, payment_asset TEXT, hcs_seq INTEGER, batch_id TEXT,
    status TEXT NOT NULL, created_at INTEGER NOT NULL, receipt TEXT);
  CREATE TABLE IF NOT EXISTS batch (batch_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, merkle_root TEXT NOT NULL, record_count INTEGER NOT NULL,
    tokens INTEGER NOT NULL, amount INTEGER NOT NULL, baseline_amount INTEGER NOT NULL, post_tx TEXT, window_ends INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL);
`;

const UNIT = JSON.stringify({ r_in: 180000, r_cached: 36000, r_out: 540000, price_version: 3 });
const MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const T0 = 1762400000000; // fixed epoch ms so the fixture is deterministic

export const RECORDS = [
  ["req-sample-a1", "A", "0.0.5551234", MODEL, 2048, 2048, 0, 256, 512, 0, 0, null, 812.4, 2410.0, null, UNIT, 645, 507, 1240, "0.0.5551234@1762400000.123456789", "USDC", 101, null, "done", T0 + 1000, null],
  ["req-sample-a2", "A", "0.0.7779999", MODEL, 2048, 2048, 1792, 300, 512, 1, 0, null, 190.2, 1900.5, null, UNIT, 645, 236, 1266, "0.0.7779999@1762400060.987654321", "USDC", 102, null, "done", T0 + 61000, null],
  ["req-sample-b1", "B", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", MODEL, 4096, 4096, 3584, 400, 1024, 2, 1, null, 205.7, 2600.1, null, UNIT, 1291, 433, 2592, null, null, null, "batch-sample-1", "done", T0 + 120000, null],
];

export const BATCHES = [
  ["batch-sample-1", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", "0x9f1c6d4b2a3e5f7081928374655647382910abcdef1234567890abcdef123456", 1, 4496, 433, 2592,
    "0x5e1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8", T0 + 420000, "posted", T0 + 130000],
];

export function buildFixtureLedger(dbPath) {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  const ins = db.prepare(`INSERT INTO usage_record VALUES (${RECORDS[0].map(() => "?").join(",")})`);
  for (const r of RECORDS) ins.run(...r);
  const insB = db.prepare(`INSERT INTO batch VALUES (${BATCHES[0].map(() => "?").join(",")})`);
  for (const b of BATCHES) insB.run(...b);
  db.close();
  return dbPath;
}
