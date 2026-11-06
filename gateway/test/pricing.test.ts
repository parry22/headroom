import { describe, expect, it } from "vitest";
import { NOMINAL_WORKLOAD, computeRates, quoteMicro, usageMicro } from "../src/pricing.js";

const base = { gpu_usd_per_hr: 3.0, host_usd_per_hr: 0.2, h200_usd_per_hr: 3.9, h200_source: "vast", h200_ts: 1, cre_run_id: null,
  tokens_per_hr_b: 20_000_000, tokens_per_hr_c: 40_000_000, bench_source: "test", hbm_gb: 80, weights_gb: 16, h200_hbm_gb: 141, k: 0.3, m: 0.1, workload: NOMINAL_WORKLOAD };

describe("pricing", () => {
  it("p sits between c_a(1+m) and c_b and splits into 1 / 0.25 / 4 rates", () => {
    const r = computeRates(base);
    expect(r.c_a).toBeCloseTo((3.2 / 40_000_000) * 1e6, 9);
    expect(r.c_b).toBeCloseTo((3.9 / (20_000_000 * (125 / 64))) * 1e6, 9);
    expect(r.p).toBeGreaterThanOrEqual(r.c_a * 1.1 - 1e-12);
    expect(r.p).toBeLessThanOrEqual(r.c_b + 1e-12);
    expect(r.r_cached).toBe(Math.round(r.r_in * 0.25));
    expect(r.r_out).toBe(r.r_in * 4);
    // workload average equals p (within rounding of r_in to micro-USD)
    const { uncached, cached, output } = NOMINAL_WORKLOAD;
    const avg = (r.r_in * uncached + r.r_cached * cached + r.r_out * output) / (uncached + cached + output) / 1e6;
    expect(avg).toBeCloseTo(r.p, 3);
  });
  it("clamps to the margin floor when the H200 gap is negative", () => {
    const r = computeRates({ ...base, h200_usd_per_hr: 0.5 });
    expect(r.gap_negative).toBe(true);
    expect(r.p).toBeCloseTo(r.c_a * 1.1, 12);
  });
  it("quotes with exact integer ceil and a 1 micro-USDC floor", () => {
    expect(quoteMicro(1_000_000, 4_000_000, 1000, 256)).toBe(1000 + 1024);
    expect(quoteMicro(123_456, 493_824, 1, 1)).toBe(1);
    expect(quoteMicro(123_456, 493_824, 33_000, 256)).toBe(Math.ceil((123_456 * 33_000 + 493_824 * 256) / 1e6));
  });
  it("usage cost never exceeds the conservative quote", () => {
    const r = computeRates(base);
    for (const [p, c, o] of [[30_000, 20_000, 256], [8_000, 0, 10], [36_000, 36_000, 256]]) {
      expect(usageMicro(r, p, c, o)).toBeLessThanOrEqual(quoteMicro(r.r_in, r.r_out, p, 256));
    }
  });
});
