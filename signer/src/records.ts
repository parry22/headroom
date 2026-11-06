/** Ledger records -> receipt fields -> leaves. Shares hashing with the gateway so the escrow recomputes the same leaf. */
import { Ledger, type UsageRecord } from "../../gateway/src/ledger.js";
import { leafHash, requestIdHash, type ReceiptFields } from "../../gateway/src/receipt.js";
import type { Hex } from "viem";

export function fieldsOf(r: UsageRecord): ReceiptFields {
  const rc = r.receipt ? JSON.parse(Buffer.from(r.receipt, "base64").toString()) : null;
  return {
    requestId: requestIdHash(r.request_id), buyer: r.buyer,
    promptTokens: BigInt(r.prompt_tokens), cachedTokens: BigInt(r.cached_tokens), completionTokens: BigInt(r.completion_tokens),
    rIn: BigInt(r.unit_prices.r_in), rCached: BigInt(r.unit_prices.r_cached), rOut: BigInt(r.unit_prices.r_out),
    price: BigInt(r.price), timestamp: BigInt(rc?.timestamp ?? Math.floor(r.created_at / 1000)),
  };
}
export function tupleOf(f: ReceiptFields) {
  return { requestId: f.requestId, buyer: f.buyer, promptTokens: f.promptTokens, cachedTokens: f.cachedTokens, completionTokens: f.completionTokens,
    rIn: f.rIn, rCached: f.rCached, rOut: f.rOut, price: f.price, timestamp: f.timestamp };
}
export function unbatched(ledger: Ledger, buyer: string): UsageRecord[] {
  return (ledger.db.prepare(`SELECT * FROM usage_record WHERE mode='B' AND buyer=? AND status='done' AND batch_id IS NULL ORDER BY created_at`).all(buyer) as any[])
    .map(r => ({ ...r, unit_prices: JSON.parse(r.unit_prices) }));
}
export function leavesOf(records: UsageRecord[]): { leaves: Hex[]; fields: ReceiptFields[] } {
  const fields = records.map(fieldsOf);
  return { leaves: fields.map(leafHash), fields };
}
