import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { readBatch, readLedger, readRecord, SQL, UNITS_NOTE } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/**
 * Evidence endpoint for every ledger-derived number on the dashboard.
 *   GET /api/ledger-summary                 aggregates + last rows, with the SQL used
 *   GET /api/ledger-summary?request_id=ID   one usage_record
 *   GET /api/ledger-summary?batch_id=ID     one batch
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("request_id");
  const batchId = url.searchParams.get("batch_id");
  const headers = { "cache-control": "no-store" };

  if (requestId) {
    const record = readRecord(requestId);
    if (!record) return NextResponse.json({ ok: false, error: "no data yet", sql: SQL.record, request_id: requestId }, { status: 404, headers });
    return NextResponse.json({ ok: true, sql: SQL.record, units: UNITS_NOTE, record }, { headers });
  }
  if (batchId) {
    const batch = readBatch(batchId);
    if (!batch) return NextResponse.json({ ok: false, error: "no data yet", sql: SQL.batch, batch_id: batchId }, { status: 404, headers });
    return NextResponse.json({ ok: true, sql: SQL.batch, units: UNITS_NOTE, batch }, { headers });
  }

  const data = readLedger(50);
  if (!data) return NextResponse.json({ ok: false, error: "no data yet", ledger_path: path.basename(env.ledgerPath) }, { status: 404, headers });
  return NextResponse.json({
    ok: true,
    generated_at: Date.now(),
    ledger: path.basename(data.path),
    fixture: data.fixture,
    snapshot: data.snapshot,
    team_wallets_excluded: env.teamWallets.length,
    units: UNITS_NOTE,
    sql: { paid: SQL.paid, external: SQL.external(env.teamWallets.length), cost: SQL.cost, batches: SQL.batches, receipts: SQL.receipts, batch_list: SQL.batchList },
    summary: data.summary,
    receipts: data.receipts,
    batches: data.batches,
  }, { headers });
}
