/** SQLite ledger (node:sqlite, no native build). One usage_record per request; prices recompute from the record. */
import { DatabaseSync } from "node:sqlite";

export interface UnitPrices { r_in: number; r_cached: number; r_out: number; price_version: number }
export interface UsageRecord {
  request_id: string; mode: "A" | "B"; buyer: string; model: string;
  prompt_tokens: number; quoted_prompt_tokens: number; cached_tokens: number; completion_tokens: number; max_tokens: number;
  tier_l1_delta: number | null; tier_l2_delta: number | null; kv_bytes_peak: number | null;
  ttft_ms: number | null; latency_ms: number | null; gpu_seconds: number | null;
  unit_prices: UnitPrices; price: number; actual_cost: number | null; baseline_cost: number | null;
  payment_tx: string | null; payment_asset: string | null; hcs_seq: number | null; batch_id: string | null;
  status: "quoted" | "paid" | "done" | "failed"; created_at: number; receipt: string | null;
}
export interface Budget { buyer: string; daily_cap: number | null; max_price_per_request: number | null; allowlist: string[]; session_keys: string[] }

export class Ledger {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS usage_record (
        request_id TEXT PRIMARY KEY, mode TEXT NOT NULL, buyer TEXT NOT NULL, model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL, quoted_prompt_tokens INTEGER NOT NULL, cached_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
        max_tokens INTEGER NOT NULL, tier_l1_delta INTEGER, tier_l2_delta INTEGER, kv_bytes_peak INTEGER,
        ttft_ms REAL, latency_ms REAL, gpu_seconds REAL, unit_prices TEXT NOT NULL, price INTEGER NOT NULL,
        actual_cost INTEGER, baseline_cost INTEGER, payment_tx TEXT, payment_asset TEXT, hcs_seq INTEGER, batch_id TEXT,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, receipt TEXT);
      CREATE INDEX IF NOT EXISTS usage_buyer_ts ON usage_record(buyer, created_at);
      CREATE TABLE IF NOT EXISTS budget (buyer TEXT PRIMARY KEY, daily_cap INTEGER, max_price_per_request INTEGER,
        allowlist TEXT NOT NULL DEFAULT '[]', session_keys TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS price_snapshot (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, gpu_type TEXT NOT NULL,
        usd_per_hr REAL NOT NULL, source TEXT NOT NULL, cre_run_id TEXT);
      CREATE TABLE IF NOT EXISTS price_version (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, inputs TEXT NOT NULL,
        r_in INTEGER NOT NULL, r_cached INTEGER NOT NULL, r_out INTEGER NOT NULL, c_a REAL NOT NULL, c_b REAL NOT NULL, p REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS seen_payment (key TEXT PRIMARY KEY, request_id TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, request_id TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS batch (batch_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, merkle_root TEXT NOT NULL, record_count INTEGER NOT NULL,
        tokens INTEGER NOT NULL, amount INTEGER NOT NULL, baseline_amount INTEGER NOT NULL, post_tx TEXT, window_ends INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
  }
  insert(r: UsageRecord): void {
    this.db.prepare(`INSERT INTO usage_record (request_id,mode,buyer,model,prompt_tokens,quoted_prompt_tokens,cached_tokens,completion_tokens,max_tokens,
      tier_l1_delta,tier_l2_delta,kv_bytes_peak,ttft_ms,latency_ms,gpu_seconds,unit_prices,price,actual_cost,baseline_cost,payment_tx,payment_asset,
      hcs_seq,batch_id,status,created_at,receipt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(r.request_id, r.mode, r.buyer, r.model, r.prompt_tokens, r.quoted_prompt_tokens, r.cached_tokens, r.completion_tokens, r.max_tokens,
        r.tier_l1_delta, r.tier_l2_delta, r.kv_bytes_peak, r.ttft_ms, r.latency_ms, r.gpu_seconds, JSON.stringify(r.unit_prices), r.price,
        r.actual_cost, r.baseline_cost, r.payment_tx, r.payment_asset, r.hcs_seq, r.batch_id, r.status, r.created_at, r.receipt);
  }
  update(request_id: string, patch: Partial<UsageRecord>): void {
    const cols = Object.keys(patch).filter(k => k !== "request_id");
    if (!cols.length) return;
    const vals = cols.map(k => { const v = (patch as any)[k]; return typeof v === "object" && v !== null ? JSON.stringify(v) : v; });
    this.db.prepare(`UPDATE usage_record SET ${cols.map(c => `${c}=?`).join(",")} WHERE request_id=?`).run(...vals, request_id);
  }
  get(request_id: string): UsageRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM usage_record WHERE request_id=?`).get(request_id) as any;
    return row ? { ...row, unit_prices: JSON.parse(row.unit_prices) } : undefined;
  }
  listByBuyer(buyer: string, limit = 200): UsageRecord[] {
    return (this.db.prepare(`SELECT * FROM usage_record WHERE buyer=? ORDER BY created_at DESC LIMIT ?`).all(buyer, limit) as any[])
      .map(r => ({ ...r, unit_prices: JSON.parse(r.unit_prices) }));
  }
  sample(n: number, status = "done"): UsageRecord[] {
    return (this.db.prepare(`SELECT * FROM usage_record WHERE status=? AND payment_tx IS NOT NULL ORDER BY RANDOM() LIMIT ?`).all(status, n) as any[])
      .map(r => ({ ...r, unit_prices: JSON.parse(r.unit_prices) }));
  }
  dailySpend(buyer: string, now: number): number {
    const dayStart = Math.floor(now / 86400000) * 86400000;
    const row = this.db.prepare(`SELECT COALESCE(SUM(price),0) s FROM usage_record WHERE buyer=? AND created_at>=? AND status IN ('paid','done')`).get(buyer, dayStart) as any;
    return Number(row.s);
  }
  paidCount(): number {
    return Number((this.db.prepare(`SELECT COUNT(*) c FROM usage_record WHERE payment_tx IS NOT NULL`).get() as any).c);
  }
  externalStats(teamWallets: string[]): { wallets: number; requests: number; tokens: number } {
    const ph = teamWallets.map(() => "?").join(",") || "''";
    const row = this.db.prepare(`SELECT COUNT(DISTINCT buyer) w, COUNT(*) r, COALESCE(SUM(prompt_tokens+completion_tokens),0) t
      FROM usage_record WHERE payment_tx IS NOT NULL AND buyer NOT IN (${ph})`).get(...teamWallets) as any;
    return { wallets: Number(row.w), requests: Number(row.r), tokens: Number(row.t) };
  }
  getBudget(buyer: string): Budget | undefined {
    const row = this.db.prepare(`SELECT * FROM budget WHERE buyer=?`).get(buyer) as any;
    return row ? { buyer, daily_cap: row.daily_cap, max_price_per_request: row.max_price_per_request,
      allowlist: JSON.parse(row.allowlist), session_keys: JSON.parse(row.session_keys) } : undefined;
  }
  setBudget(b: Budget): void {
    this.db.prepare(`INSERT INTO budget (buyer,daily_cap,max_price_per_request,allowlist,session_keys,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(buyer) DO UPDATE SET daily_cap=excluded.daily_cap, max_price_per_request=excluded.max_price_per_request,
      allowlist=excluded.allowlist, session_keys=excluded.session_keys, updated_at=excluded.updated_at`)
      .run(b.buyer, b.daily_cap, b.max_price_per_request, JSON.stringify(b.allowlist), JSON.stringify(b.session_keys), Date.now());
  }
  /** Replay protection: returns false if the payment key was already seen. */
  markPayment(key: string, request_id: string): boolean {
    try { this.db.prepare(`INSERT INTO seen_payment (key,request_id,ts) VALUES (?,?,?)`).run(key, request_id, Date.now()); return true; }
    catch { return false; }
  }
  idempotent(key: string, request_id: string): string | null {
    const row = this.db.prepare(`SELECT request_id FROM idempotency WHERE key=?`).get(key) as any;
    if (row) return row.request_id;
    this.db.prepare(`INSERT INTO idempotency (key,request_id,ts) VALUES (?,?,?)`).run(key, request_id, Date.now());
    return null;
  }
  addPriceSnapshot(s: { ts: number; gpu_type: string; usd_per_hr: number; source: string; cre_run_id?: string }): void {
    this.db.prepare(`INSERT INTO price_snapshot (ts,gpu_type,usd_per_hr,source,cre_run_id) VALUES (?,?,?,?,?)`)
      .run(s.ts, s.gpu_type, s.usd_per_hr, s.source, s.cre_run_id ?? null);
  }
  latestSnapshot(gpu_type: string): { ts: number; usd_per_hr: number; source: string; cre_run_id: string | null } | undefined {
    return this.db.prepare(`SELECT ts,usd_per_hr,source,cre_run_id FROM price_snapshot WHERE gpu_type=? ORDER BY ts DESC LIMIT 1`).get(gpu_type) as any;
  }
  addPriceVersion(v: { ts: number; inputs: unknown; r_in: number; r_cached: number; r_out: number; c_a: number; c_b: number; p: number }): number {
    const res = this.db.prepare(`INSERT INTO price_version (ts,inputs,r_in,r_cached,r_out,c_a,c_b,p) VALUES (?,?,?,?,?,?,?,?)`)
      .run(v.ts, JSON.stringify(v.inputs), v.r_in, v.r_cached, v.r_out, v.c_a, v.c_b, v.p);
    return Number(res.lastInsertRowid);
  }
  priceVersion(id: number): any { const r = this.db.prepare(`SELECT * FROM price_version WHERE id=?`).get(id) as any; return r ? { ...r, inputs: JSON.parse(r.inputs) } : undefined; }
  close(): void { this.db.close(); }
}
