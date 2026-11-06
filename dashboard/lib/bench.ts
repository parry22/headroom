import fs from "node:fs";
import path from "node:path";
import { benchPath, links } from "./env";

export interface LevelRow {
  config: string; run: string; level: number; turns: number; errors: number;
  ttft_p50_hit_ms: number | null; ttft_p95_hit_ms: number | null; ttft_p95_miss_ms: number | null;
  tokens_per_s: number | null; kv_reuse_rate: number | null; u_mean: number | null; u_p50: number | null;
  l1_hits_delta: number | null; l2_hits_delta: number | null; external_prefix_hits_delta: number | null;
  preemptions_delta: number | null; kv_usage_max: number | null; pass: boolean;
}
export interface M6Row {
  formula_bytes: number | null; measured_bytes: number | null; delta_pct: number | null;
  kv_cache_tokens: number | null; vllm_version: string | null; lmcache_version: string | null;
}
export interface BenchReport {
  dir: string;
  bars: { ttft_hit_ms: number; ttft_miss_ms: number };
  capacity: Record<string, number | null>;
  gains: { n_c_over_n_b: number | null; n_b_over_n_a: number | null; runs_per_config: Record<string, number> };
  levels: LevelRow[];
  m1: { c_levels_with_l1_and_l2_hits: number[]; c_kv_usage_max_by_level: Record<string, number | null> };
  m6: Record<string, M6Row>;
  m7: { s_hbm_sessions?: number; s_dram_sessions?: number | null; u_at_capacity?: number | null; n_max_formula?: number | null; n_c_measured?: number | null };
}

export interface BenchData {
  report: BenchReport;
  source: string;           // absolute file read
  runDir: string;           // basename of report.dir
  evidence: { reportMd: string; turnsCsv: string; metricsCsv: string; gateway: string };
}

/** Read bench/results/latest.json at request time. Null when no report exists. */
export function readBench(): BenchData | null {
  const p = benchPath();
  if (!p) return null;
  try {
    const report = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8")) as BenchReport;
    const runDir = path.basename((report.dir || "").replace(/\/$/, "")) || "latest";
    return {
      report, source: p, runDir,
      evidence: {
        reportMd: links.benchFile(runDir, "report.md"),
        turnsCsv: links.benchFile(runDir, "turns.csv"),
        metricsCsv: links.benchFile(runDir, "metrics.csv"),
        gateway: links.benchLatest,
      },
    };
  } catch {
    return null;
  }
}
