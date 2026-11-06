/**
 * Pricing model (PRD 7.4):  p = c_a + k (c_b - c_a),  c_a (1+m) <= p <= c_b
 * c_b = H200 $/hr / H200 tokens/hr (modelled from config B scaled by HBM available for KV when no H200 run exists)
 * c_a = (node GPU $/hr + host RAM/NVMe $/hr) / tokens/hr at config C capacity point
 * p splits into r_in (uncached input, weight 1), r_cached (0.25), r_out (4), calibrated so the replay workload averages to p.
 * All rates are integers in micro-USD per 1M tokens, so a quote is exact integer math:
 *   q (micro-USDC) = ceil((r_in * prompt_tokens + r_out * max_tokens) / 1e6)
 */
import fs from "node:fs";

export interface PricingInputs {
  gpu_usd_per_hr: number; host_usd_per_hr: number;
  h200_usd_per_hr: number | null; h200_source: string; h200_ts: number | null; cre_run_id: string | null;
  tokens_per_hr_b: number | null; tokens_per_hr_c: number | null; bench_source: string;
  hbm_gb: number; weights_gb: number; h200_hbm_gb: number;
  k: number; m: number;
  workload: { uncached: number; cached: number; output: number };
}
export interface Rates { r_in: number; r_cached: number; r_out: number; c_a: number; c_b: number; p: number; c_b_modelled: boolean; gap_negative: boolean; weighted_per_token: number }

/** Nominal PRD 7.3 replay workload token classes per session (8 turns), used until a bench report exists. */
export const NOMINAL_WORKLOAD = { uncached: 36864, cached: 155648, output: 2048 };

export function computeRates(i: PricingInputs): Rates {
  if (!i.tokens_per_hr_c || !i.tokens_per_hr_b) throw new Error("pricing needs tokens_per_hr for B and C (bench report or BOOTSTRAP_TOKENS_PER_HR_*)");
  const c_a = ((i.gpu_usd_per_hr + i.host_usd_per_hr) / i.tokens_per_hr_c) * 1e6;          // USD per 1M tokens
  const hbmScale = (i.h200_hbm_gb - i.weights_gb) / (i.hbm_gb - i.weights_gb);               // KV room ratio, H200 vs this GPU
  const h200 = i.h200_usd_per_hr ?? 0;
  const c_b = h200 > 0 ? (h200 / (i.tokens_per_hr_b * hbmScale)) * 1e6 : c_a * (1 + i.m);
  const floor = c_a * (1 + i.m);
  let p = c_a + i.k * (c_b - c_a);
  const gap_negative = c_b < floor;
  p = Math.min(Math.max(p, floor), Math.max(c_b, floor));
  const { uncached, cached, output } = i.workload;
  const total = uncached + cached + output;
  const weighted_per_token = (uncached + 0.25 * cached + 4 * output) / total;
  const r_in_usd = p / weighted_per_token;                                                  // USD per 1M uncached input tokens
  const r_in = Math.round(r_in_usd * 1e6);
  return { r_in, r_cached: Math.round(r_in * 0.25), r_out: r_in * 4, c_a, c_b, p, c_b_modelled: true, gap_negative, weighted_per_token };
}

/** Conservative Mode A quote: all input priced as uncached, output at max_tokens. micro-USDC. */
export function quoteMicro(r_in: number, r_out: number, prompt_tokens: number, max_tokens: number): number {
  const num = BigInt(r_in) * BigInt(prompt_tokens) + BigInt(r_out) * BigInt(max_tokens);
  const q = (num + 999_999n) / 1_000_000n;
  return Number(q < 1n ? 1n : q);
}
/** Cost at actual usage with a given per-1M rate table (micro-USD). */
export function usageMicro(r: { r_in: number; r_cached: number; r_out: number }, prompt: number, cached: number, completion: number): number {
  const uncached = Math.max(0, prompt - cached);
  const num = BigInt(r.r_in) * BigInt(uncached) + BigInt(r.r_cached) * BigInt(cached) + BigInt(r.r_out) * BigInt(completion);
  return Number((num + 999_999n) / 1_000_000n);
}

/** Pull tokens/hr at the capacity point for configs B and C from bench/results/latest.json. */
export function benchThroughput(latestPath: string): { b: number | null; c: number | null; source: string; workload: typeof NOMINAL_WORKLOAD } {
  if (!fs.existsSync(latestPath)) return { b: null, c: null, source: "none", workload: NOMINAL_WORKLOAD };
  const rep = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const at = (cfg: string): number | null => {
    const cap = rep.capacity?.[cfg];
    if (!cap) return null;
    const rows = (rep.levels as any[]).filter(l => l.config === cfg && l.level === cap && l.tokens_per_s);
    if (!rows.length) return null;
    const tps = rows.reduce((s, r) => s + r.tokens_per_s, 0) / rows.length;
    return tps * 3600;
  };
  // Token class mix from the C capacity level: cached share from kv_reuse_rate, output from 256/turn.
  const cRows = (rep.levels as any[]).filter(l => l.config === "C" && l.level === rep.capacity?.C);
  let workload = NOMINAL_WORKLOAD;
  if (cRows.length && cRows[0].kv_reuse_rate != null) {
    const reuse = cRows[0].kv_reuse_rate;
    const prompt = NOMINAL_WORKLOAD.uncached + NOMINAL_WORKLOAD.cached;
    workload = { uncached: Math.round(prompt * (1 - reuse)), cached: Math.round(prompt * reuse), output: NOMINAL_WORKLOAD.output };
  }
  return { b: at("B"), c: at("C"), source: `bench:${rep.dir ?? "latest"}`, workload };
}
