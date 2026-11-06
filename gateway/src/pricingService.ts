/** Holds the current rate table; refreshes from price snapshots (CRE) and the latest bench report. */
import { cfg } from "./config.js";
import type { Ledger } from "./ledger.js";
import { NOMINAL_WORKLOAD, benchThroughput, computeRates, type PricingInputs, type Rates } from "./pricing.js";

export interface Current { rates: Rates; inputs: PricingInputs; version: number; ts: number }

export class PricingService {
  private current: Current | null = null;
  constructor(private ledger: Ledger) {}
  refresh(now = Date.now()): Current {
    const h200 = this.ledger.latestSnapshot("H200");
    const bench = benchThroughput(cfg.benchLatest);
    const inputs: PricingInputs = {
      gpu_usd_per_hr: cfg.gpuUsdPerHr, host_usd_per_hr: cfg.hostUsdPerHr,
      h200_usd_per_hr: h200?.usd_per_hr ?? null, h200_source: h200?.source ?? "none", h200_ts: h200?.ts ?? null, cre_run_id: h200?.cre_run_id ?? null,
      tokens_per_hr_b: bench.b ?? (cfg.bootstrapTokensPerHrB || null), tokens_per_hr_c: bench.c ?? (cfg.bootstrapTokensPerHrC || null),
      bench_source: bench.b ? bench.source : "bootstrap-env",
      hbm_gb: cfg.gpuHbmGb, weights_gb: cfg.weightsGb, h200_hbm_gb: cfg.h200HbmGb, k: cfg.k, m: cfg.m,
      workload: bench.workload ?? NOMINAL_WORKLOAD,
    };
    const rates = computeRates(inputs);
    const prev = this.current;
    if (!prev || prev.rates.r_in !== rates.r_in || prev.rates.r_out !== rates.r_out || prev.inputs.h200_ts !== inputs.h200_ts) {
      const version = this.ledger.addPriceVersion({ ts: now, inputs, r_in: rates.r_in, r_cached: rates.r_cached, r_out: rates.r_out, c_a: rates.c_a, c_b: rates.c_b, p: rates.p });
      this.current = { rates, inputs, version, ts: now };
    }
    return this.current!;
  }
  get(): Current { return this.current ?? this.refresh(); }
  stale(now = Date.now()): boolean { const ts = this.get().inputs.h200_ts; return !ts || now - ts > cfg.baselineStaleSeconds * 1000; }
  publicView(now = Date.now()) {
    const c = this.get();
    return {
      model: cfg.model, currency: "USDC", units: "micro-USD per 1M tokens",
      rates: { uncached_input: c.rates.r_in, cached_input: c.rates.r_cached, output: c.rates.r_out },
      usd_per_1m: { uncached_input: c.rates.r_in / 1e6, cached_input: c.rates.r_cached / 1e6, output: c.rates.r_out / 1e6 },
      c_a_usd_per_1m: c.rates.c_a, c_b_usd_per_1m: c.rates.c_b, p_usd_per_1m: c.rates.p, k: cfg.k, m: cfg.m,
      c_b_modelled: c.rates.c_b_modelled, gap_negative: c.rates.gap_negative,
      baseline: { h200_usd_per_hr: c.inputs.h200_usd_per_hr, source: c.inputs.h200_source, ts: c.inputs.h200_ts, cre_run_id: c.inputs.cre_run_id, stale: this.stale(now) },
      throughput: { tokens_per_hr_b: c.inputs.tokens_per_hr_b, tokens_per_hr_c: c.inputs.tokens_per_hr_c, source: c.inputs.bench_source },
      workload_mix: c.inputs.workload, price_version: c.version, quote_formula: "ceil((r_in*prompt_tokens + r_out*max_tokens)/1e6) micro-USDC",
    };
  }
}
