import type { BenchData } from "@/lib/bench";
import { links } from "@/lib/env";
import { fmt, fmtInt, fmtPct } from "@/lib/fmt";
import { CapacityBars } from "./CapacityBars";
import { CapacityCurve, LevelsTable } from "./CapacityCurve";
import { Num, NoData, Tag } from "./Num";
import { Alert, Card, Empty, Evidence, KV, PageHeader } from "./ui";

export function MemorySection({ bench, fixture }: { bench: BenchData | null; fixture: boolean }) {
  return (
    <>
      <PageHeader
        eyebrow={fixture ? <Tag kind="warn">sample fixture</Tag> : undefined}
        title="Live sessions per GPU, with and without memory tiers"
        actions={bench ? <Tag kind="muted">run <Num href={bench.evidence.reportMd} value={bench.runDir} /></Tag> : null}
      >
        Same GPU, same model. Config B is the tuned baseline (eight-bit KV, prefix cache); config C adds LMCache DRAM and NVMe tiers. Capacity is
        the largest N whose TTFT tail (the ninety-fifth percentile) stays under the bar with zero errors.
      </PageHeader>

      {!bench ? (
        <Empty>No bench report yet. Run the bench and this page fills in.</Empty>
      ) : (
        <div className="stack">
          <Evidence
            items={[
              { label: "report.md", href: bench.evidence.reportMd },
              { label: "turns.csv", href: bench.evidence.turnsCsv },
              { label: "metrics.csv", href: bench.evidence.metricsCsv },
              { label: "gateway bench JSON", href: bench.evidence.gateway },
              { label: "correctness diff", href: links.correctnessDiff },
            ]}
          />
          <Alert kind="warn">
            The greedy-output check of config C after a cache reload, against config B, is currently failing. See the{" "}
            <a href={links.correctnessDiff} target="_blank" rel="noreferrer">correctness diff</a>.
          </Alert>

          <div className="split">
            <Card title="Capacity per config" sub="Largest N that passes the bar with zero errors.">
              <CapacityBars bench={bench} />
            </Card>
            <Card title="Gains and bar" sub="Ratios of measured capacity, and the latency bar each level is judged against.">
              <KV
                rows={[
                  { label: "N_C over N_B", value: <Num href={bench.evidence.reportMd} value={fmt(bench.report.gains.n_c_over_n_b, 2)} /> },
                  { label: "N_B over N_A", value: <Num href={bench.evidence.reportMd} value={fmt(bench.report.gains.n_b_over_n_a, 2)} /> },
                  { label: "TTFT bar on hit, ms", value: <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.bars.ttft_hit_ms)} /> },
                  { label: "TTFT bar on miss, ms", value: <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.bars.ttft_miss_ms)} /> },
                  ...Object.keys(bench.report.gains.runs_per_config ?? {}).sort().map((c) => ({
                    label: `Runs, config ${c}`,
                    value: <Num href={bench.evidence.reportMd} value={fmtInt(bench.report.gains.runs_per_config[c])} />,
                  })),
                ]}
              />
            </Card>
          </div>

          <Card title="Capacity curve" sub="TTFT tail on cache hit against concurrent sessions. Each point is one level of one run; click it for turns.csv.">
            <CapacityCurve bench={bench} />
          </Card>

          <Detail title="Every level measured" sub="Turns, errors, latency percentiles, throughput and KV reuse for each load level of each run.">
            <LevelsTable bench={bench} />
          </Detail>
          <Detail title="Tier hits per config C level" sub="Whether the DRAM and NVMe tiers were actually used at each load level.">
            <TierTable bench={bench} />
          </Detail>
          <Detail title="KV bytes per token and capacity formula" sub="Formula against measured, and predicted capacity against config C.">
            <div className="split wide-left" style={{ alignItems: "start" }}>
              <M6Table bench={bench} />
              <M7 bench={bench} />
            </div>
          </Detail>
        </div>
      )}
    </>
  );
}

function TierTable({ bench }: { bench: BenchData }) {
  const rows = bench.report.levels.filter((r) => r.config === "C");
  if (!rows.length) return <NoData />;
  const ev = bench.evidence.metricsCsv;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>run</th><th>N</th><th>DRAM tier hits</th><th>NVMe tier hits</th><th>external prefix hits</th><th>preemptions</th><th>KV usage max</th><th>both tiers hit</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.run}:${r.level}`}>
              <td><Num href={ev} value={r.run} /></td>
              <td><Num href={ev} value={fmtInt(r.level)} /></td>
              <td><Num href={ev} value={fmtInt(r.l1_hits_delta)} /></td>
              <td><Num href={ev} value={fmtInt(r.l2_hits_delta)} /></td>
              <td><Num href={ev} value={fmtInt(r.external_prefix_hits_delta)} /></td>
              <td><Num href={ev} value={fmtInt(r.preemptions_delta)} /></td>
              <td><Num href={ev} value={fmtPct(r.kv_usage_max)} /></td>
              <td>{bench.report.m1.c_levels_with_l1_and_l2_hits.includes(r.level) ? <span className="badge badge-ok">yes</span> : <span className="badge badge-neutral">no</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function M6Table({ bench }: { bench: BenchData }) {
  const entries = Object.entries(bench.report.m6 ?? {});
  if (!entries.length) return <NoData />;
  const ev = bench.evidence.reportMd;
  return (
    <div className="table-wrap">
      <table className="data">
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
    </div>
  );
}

function M7({ bench }: { bench: BenchData }) {
  const m = bench.report.m7 ?? {};
  const ev = bench.evidence.reportMd;
  const items: [string, string | null][] = [
    ["Sessions that fit in HBM", fmt(m.s_hbm_sessions, 1)],
    ["Sessions that fit in DRAM", fmt(m.s_dram_sessions, 1)],
    ["Utilisation u at capacity", fmt(m.u_at_capacity, 3)],
    ["N max from formula", fmt(m.n_max_formula, 1)],
    ["N measured, config C", fmtInt(m.n_c_measured)],
  ];
  return (
    <KV rows={items.map(([k, v]) => ({ label: k, value: <Num href={ev} value={v} /> }))} />
  );
}

/** Technical depth, folded by default so the verdict above stays the first thing a reader sees. */
function Detail({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <details className="more-detail">
      <summary>
        <div>
          <h2>{title}</h2>
          <div className="sub">{sub}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}
