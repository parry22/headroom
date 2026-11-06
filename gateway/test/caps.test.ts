import { describe, expect, it } from "vitest";
import { Ledger } from "../src/ledger.js";
import { checkCaps } from "../src/caps.js";

function ledger() { return new Ledger(":memory:"); }
const rec = (l: Ledger, buyer: string, price: number, status: "paid" | "done" = "done") => l.insert({
  request_id: Math.random().toString(36).slice(2), mode: "A", buyer, model: "m", prompt_tokens: 10, quoted_prompt_tokens: 10, cached_tokens: 0, completion_tokens: 1, max_tokens: 1,
  tier_l1_delta: null, tier_l2_delta: null, kv_bytes_peak: null, ttft_ms: null, latency_ms: null, gpu_seconds: null,
  unit_prices: { r_in: 1, r_cached: 1, r_out: 1, price_version: 1 }, price, actual_cost: null, baseline_cost: null,
  payment_tx: "0.0.1@1.1", payment_asset: "0.0.429274", hcs_seq: null, batch_id: null, status, created_at: Date.now(), receipt: null });

describe("caps", () => {
  it("refuses when the max-price header is below the quote", () => {
    expect(checkCaps(ledger(), "0.0.5", "m", 1500, "1000").reason).toBe("price_above_max");
    expect(checkCaps(ledger(), "0.0.5", "m", 900, "1000").ok).toBe(true);
  });
  it("refuses over the daily cap, counting today's paid spend", () => {
    const l = ledger();
    l.setBudget({ buyer: "0.0.5", daily_cap: 10_000, max_price_per_request: null, allowlist: [], session_keys: [] });
    rec(l, "0.0.5", 6000); rec(l, "0.0.5", 3000);
    expect(checkCaps(l, "0.0.5", "m", 1500, undefined).reason).toBe("daily_cap_exceeded");
    expect(checkCaps(l, "0.0.5", "m", 1000, undefined).ok).toBe(true);
  });
  it("refuses models outside the buyer allowlist and prices above the buyer max", () => {
    const l = ledger();
    l.setBudget({ buyer: "0.0.5", daily_cap: null, max_price_per_request: 500, allowlist: ["other-model"], session_keys: [] });
    expect(checkCaps(l, "0.0.5", "m", 100, undefined).reason).toBe("model_not_allowlisted");
    l.setBudget({ buyer: "0.0.5", daily_cap: null, max_price_per_request: 500, allowlist: [], session_keys: [] });
    expect(checkCaps(l, "0.0.5", "m", 600, undefined).reason).toBe("price_above_buyer_max");
  });
  it("replay set accepts a payment key once", () => {
    const l = ledger();
    expect(l.markPayment("k1", "r1")).toBe(true);
    expect(l.markPayment("k1", "r2")).toBe(false);
  });
});
