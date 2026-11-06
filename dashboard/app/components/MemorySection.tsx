import type { BenchData } from "@/lib/bench";
import { links } from "@/lib/env";
import { fmt, fmtInt, fmtPct } from "@/lib/fmt";
import { CapacityCurve } from "./CapacityCurve";
import { Num, NoData, Tag } from "./Num";

export function MemorySection({ bench, fixture }: { bench: BenchData | null; fixture: boolean }) {
  return (
    <section id="memory">
      <h2>Memory proof {fixture && <Tag kind="warn">sample fixture</Tag>}</h2>
      <p className="muted">
        Same GPU, same model. Config B is the tuned baseline (eight-bit KV, prefix cache); config C adds LMCache DRAM and NVMe tiers.
        Capacity is the largest N whose TTFT tail stays under the bar with zero errors.
        Tail means the ninety-fifth percentile. Greedy-output check of config C after reload against config B (M5, currently failing):{" "}
        <a href={links.correctnessDiff}>correctness diff</a>.
      </p>
      {!bench ? (
        <NoData />
      ) : (
        <>
          <p className="evidence">
            evidence: <a href={bench.evidence.reportMd}>report.md</a> · <a href={bench.evidence.turnsCsv}>turns.csv</a> ·{" "}
            <a href={bench.evidence.metricsCsv}>metrics.csv</a> · <a href={bench.evidence.gateway}>gateway bench JSON</a> · run{" "}
            <a className="num" href={bench.evidence.reportMd}>{bench.runDir}</a>
          </p>
          <CapacityCurve bench={bench} />
          <div className="cards">
            {["A", "B", "C"].map((c) => (
              <div className="card" key={c}>
                <div className="k">capacity N, config {c}</div>
                <div className="v"><Num href={bench.evidence.reportMd} value={fmtInt(bench.report.capacity[c])} /></div>
                <div className="k">runs <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.gains.runs_per_config[c])} /></div>
              </div>
            ))}
            <div className="card">
              <div className="k">gain, N_C over N_B</div>
              <div className="v"><Num href={bench.evidence.reportMd} value={fmt(bench.report.gains.n_c_over_n_b, 2)} /></div>
            </div>
            <div className="card">
              <div className="k">gain, N_B over N_A</div>
              <div className="v"><Num href={bench.evidence.reportMd} value={fmt(bench.report.gains.n_b_over_n_a, 2)} /></div>
            </div>
            <div className="card">
              <div className="k">TTFT bar, hit / miss (ms)</div>
              <div className="v">
                <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.bars.ttft_hit_ms)} /> /{" "}
                <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.bars.ttft_miss_ms)} />
              </div>
            </div>
          </div>

          <h3>Tier hits per config C level</h3>
          <TierTable bench={bench} />

          <h3>KV bytes per token: formula against measured</h3>
          <M6Table bench={bench} />

          <h3>Capacity formula check</h3>
          <M7 bench={bench} />
        </>
      )}
    </section>
  );
}

function TierTable({ bench }: { bench: BenchData }) {
  const rows = bench.report.levels.filter((r) => r.config === "C");
  if (!rows.length) return <NoData />;
  const ev = bench.evidence.metricsCsv;
  return (
    <table className="dense">
      <thead>
        <tr><th>run</th><th>N</th><th>DRAM tier hits</th><th>NVMe tier hits</th><th>external prefix hits</th><th>preemptions</th><th>KV usage max</th><th>both tiers hit</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.run}:${r.level}`}>
            <td><a className="num" href={ev}>{r.run}</a></td>
            <td><Num href={ev} value={fmtInt(r.level)} /></td>
            <td><Num href={ev} value={fmtInt(r.l1_hits_delta)} /></td>
            <td><Num href={ev} value={fmtInt(r.l2_hits_delta)} /></td>
            <td><Num href={ev} value={fmtInt(r.external_prefix_hits_delta)} /></td>
            <td><Num href={ev} value={fmtInt(r.preemptions_delta)} /></td>
            <td><Num href={ev} value={fmtPct(r.kv_usage_max)} /></td>
            <td>{bench.report.m1.c_levels_with_l1_and_l2_hits.includes(r.level) ? "yes" : "no"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function M6Table({ bench }: { bench: BenchData }) {
  const entries = Object.entries(bench.report.m6 ?? {});
  if (!entries.length) return <NoData />;
  const ev = bench.evidence.reportMd;
  return (
    <table className="dense">
      <thead>
        <tr><th>config</th><th>formula bytes</th><th>measured bytes</th><th>delta</th><th>KV cache tokens</th><th>vLLM</th><th>LMCache</th></tr>
      </thead>
      <tbody>
        {entries.map(([c, m]) => (
          <tr key={c}>
            <td>{c}</td>
            <td><Num href={ev} value={fmtInt(m.formula_bytes)} /></td>
            <td><Num href={ev} value={fmt(m.measured_bytes, 1)} /></td>
            <td><Num href={ev} value={m.delta_pct == null ? null : `${fmt(m.delta_pct, 2)}%`} /></td>
            <td><Num href={ev} value={fmtInt(m.kv_cache_tokens)} /></td>
            <td><Num href={ev} value={m.vllm_version ?? null} /></td>
            <td><Num href={ev} value={m.lmcache_version ?? null} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function M7({ bench }: { bench: BenchData }) {
  const m = bench.report.m7 ?? {};
  const ev = bench.evidence.reportMd;
  const items: [string, string | null][] = [
    ["sessions that fit in HBM", fmt(m.s_hbm_sessions, 1)],
    ["sessions that fit in DRAM", fmt(m.s_dram_sessions, 1)],
    ["utilisation u at capacity", fmt(m.u_at_capacity, 3)],
    ["N max from formula", fmt(m.n_max_formula, 1)],
    ["N measured, config C", fmtInt(m.n_c_measured)],
  ];
  return (
    <div className="cards">
      {items.map(([k, v]) => (
        <div className="card" key={k}><div className="k">{k}</div><div className="v"><Num href={ev} value={v} /></div></div>
      ))}
    </div>
  );
}
