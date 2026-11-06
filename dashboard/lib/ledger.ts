import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { env, FIXTURE_LEDGER, SNAPSHOT_LEDGER } from "./env";
import { buildFixtureLedger } from "../fixtures/ledger-fixture.mjs";

export interface UsageRow {
  request_id: string; mode: "A" | "B"; buyer: string; model: string;
  prompt_tokens: number; quoted_prompt_tokens: number; cached_tokens: number; completion_tokens: number; max_tokens: number;
  tier_l1_delta: number | null; tier_l2_delta: number | null; ttft_ms: number | null; latency_ms: number | null;
  unit_prices: string; price: number; actual_cost: number | null; baseline_cost: number | null;
  payment_tx: string | null; payment_asset: string | null; hcs_seq: number | null; batch_id: string | null;
  status: string; created_at: number;
}
export interface BatchRow {
  batch_id: string; buyer: string; merkle_root: string; record_count: number; tokens: number; amount: number;
  baseline_amount: number; post_tx: string | null; window_ends: number | null; status: string; created_at: number;
}
export interface Summary {
  paid_requests: number; paid_requests_mode_a: number; paid_requests_mode_b: number; hedera_settled: number;
  tokens_served: number; prompt_tokens: number; cached_tokens: number; completion_tokens: number;
  external_buyers: number; external_requests: number; external_tokens: number;
  done_records_costed: number; actual_cost_micro: number | null; baseline_cost_micro: number | null;
  cost_ratio: number | null; cost_per_1m_tokens_usd: number | null; baseline_per_1m_tokens_usd: number | null;
  batches: number; batches_posted: number; latest_record_at: number | null;
}

/** The SQL is part of the public evidence: /api/ledger-summary returns it verbatim. */
export const SQL = {
  paid: `SELECT COUNT(*) AS n,
    SUM(CASE WHEN mode='A' THEN 1 ELSE 0 END) AS mode_a,
    SUM(CASE WHEN mode='B' THEN 1 ELSE 0 END) AS mode_b,
    SUM(CASE WHEN payment_tx IS NOT NULL THEN 1 ELSE 0 END) AS hedera_settled,
    COALESCE(SUM(prompt_tokens+completion_tokens),0) AS tokens,
    COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(cached_tokens),0) AS cached_tokens,
    COALESCE(SUM(completion_tokens),0) AS completion_tokens, MAX(created_at) AS latest
    FROM usage_record WHERE status IN ('paid','done')`,
  external: (n: number) => `SELECT COUNT(DISTINCT buyer) AS buyers, COUNT(*) AS requests,
    COALESCE(SUM(prompt_tokens+completion_tokens),0) AS tokens
    FROM usage_record WHERE status IN ('paid','done') AND buyer NOT IN (${n ? Array(n).fill("?").join(",") : "''"})`,
  cost: `SELECT COUNT(*) AS n, SUM(actual_cost) AS actual, SUM(baseline_cost) AS baseline,
    SUM(actual_cost)*1.0/NULLIF(SUM(baseline_cost),0) AS ratio,
    SUM(actual_cost)*1.0/NULLIF(SUM(prompt_tokens+completion_tokens),0) AS actual_usd_per_1m_tokens,
    SUM(baseline_cost)*1.0/NULLIF(SUM(prompt_tokens+completion_tokens),0) AS baseline_usd_per_1m_tokens
    FROM usage_record WHERE status='done' AND actual_cost IS NOT NULL AND baseline_cost IS NOT NULL`,
  batches: `SELECT COUNT(*) AS n, SUM(CASE WHEN post_tx IS NOT NULL THEN 1 ELSE 0 END) AS posted FROM batch`,
  receipts: `SELECT request_id,mode,buyer,model,prompt_tokens,quoted_prompt_tokens,cached_tokens,completion_tokens,max_tokens,
    tier_l1_delta,tier_l2_delta,ttft_ms,latency_ms,unit_prices,price,actual_cost,baseline_cost,payment_tx,payment_asset,hcs_seq,batch_id,status,created_at
    FROM usage_record ORDER BY created_at DESC LIMIT ?`,
  batchList: `SELECT * FROM batch ORDER BY created_at DESC LIMIT ?`,
  record: `SELECT request_id,mode,buyer,model,prompt_tokens,quoted_prompt_tokens,cached_tokens,completion_tokens,max_tokens,
    tier_l1_delta,tier_l2_delta,ttft_ms,latency_ms,unit_prices,price,actual_cost,baseline_cost,payment_tx,payment_asset,hcs_seq,batch_id,status,created_at
    FROM usage_record WHERE request_id=?`,
  batch: `SELECT * FROM batch WHERE batch_id=?`,
};

/** Note on units: actual_cost and baseline_cost are micro-USD totals; micro-USD per token equals USD per million tokens. */
export const UNITS_NOTE = "actual_cost/baseline_cost/price/amount are micro-USDC integers; micro-USD per token == USD per million tokens";

export interface LedgerData {
  path: string;
  fixture: boolean;
  snapshot: boolean;
  summary: Summary;
  receipts: UsageRow[];
  batches: BatchRow[];
}

function resolveLedger(): { path: string; fixture: boolean; snapshot?: boolean } | null {
  if (fs.existsSync(/*turbopackIgnore: true*/ env.ledgerPath)) return { path: env.ledgerPath, fixture: false };
  if (fs.existsSync(SNAPSHOT_LEDGER)) return { path: SNAPSHOT_LEDGER, fixture: false, snapshot: true };
  if (!env.fixtures) return null;
  if (!fs.existsSync(FIXTURE_LEDGER)) {
    try { buildFixtureLedger(FIXTURE_LEDGER); }
    catch { return null; }
  }
  return { path: FIXTURE_LEDGER, fixture: true };
}

function open(p: string): DatabaseSync {
  try { return new DatabaseSync(p, { readOnly: true }); }
  catch { return new DatabaseSync(p); }
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Read aggregates and the latest rows. Null when no ledger file exists (and fixtures are off). */
export function readLedger(limit = 50): LedgerData | null {
  const r = resolveLedger();
  if (!r) return null;
  let db: DatabaseSync | null = null;
  try {
    db = open(r.path);
    const paid = db.prepare(SQL.paid).get() as Record<string, unknown>;
    const ext = db.prepare(SQL.external(env.teamWallets.length)).get(...env.teamWallets) as Record<string, unknown>;
    const cost = db.prepare(SQL.cost).get() as Record<string, unknown>;
    const bt = db.prepare(SQL.batches).get() as Record<string, unknown>;
    const receipts = db.prepare(SQL.receipts).all(limit) as unknown as UsageRow[];
    const batches = db.prepare(SQL.batchList).all(limit) as unknown as BatchRow[];
    const summary: Summary = {
      paid_requests: num(paid.n), paid_requests_mode_a: num(paid.mode_a), paid_requests_mode_b: num(paid.mode_b),
      hedera_settled: num(paid.hedera_settled),
      tokens_served: num(paid.tokens), prompt_tokens: num(paid.prompt_tokens), cached_tokens: num(paid.cached_tokens),
      completion_tokens: num(paid.completion_tokens),
      external_buyers: num(ext.buyers), external_requests: num(ext.requests), external_tokens: num(ext.tokens),
      done_records_costed: num(cost.n), actual_cost_micro: numOrNull(cost.actual), baseline_cost_micro: numOrNull(cost.baseline),
      cost_ratio: numOrNull(cost.ratio), cost_per_1m_tokens_usd: numOrNull(cost.actual_usd_per_1m_tokens),
      baseline_per_1m_tokens_usd: numOrNull(cost.baseline_usd_per_1m_tokens),
      batches: num(bt.n), batches_posted: num(bt.posted), latest_record_at: numOrNull(paid.latest),
    };
    return { path: r.path, fixture: r.fixture, snapshot: Boolean(r.snapshot), summary, receipts, batches };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export function readRecord(request_id: string): UsageRow | null {
  const r = resolveLedger();
  if (!r) return null;
  const db = open(r.path);
  try { return (db.prepare(SQL.record).get(request_id) as unknown as UsageRow) ?? null; }
  finally { db.close(); }
}

export function readBatch(batch_id: string): BatchRow | null {
  const r = resolveLedger();
  if (!r) return null;
  const db = open(r.path);
  try { return (db.prepare(SQL.batch).get(batch_id) as unknown as BatchRow) ?? null; }
  finally { db.close(); }
}
