import type { BenchData, LevelRow } from "@/lib/bench";
import { fmt, fmtInt, isNum } from "@/lib/fmt";
import { Num } from "./Num";

/** Baselines stay grey; config C (Headroom) is drawn in the brand gradient. */
const COLORS: Record<string, string> = { A: "#4a4a4f", B: "#8a8a92", C: "url(#cc-brand)" };
const SWATCH: Record<string, string> = { A: "#4a4a4f", B: "#8a8a92", C: "linear-gradient(90deg,#fbb39c,#f472b6,#c084fc,#818cf8)" };
const W = 720, H = 300, L = 56, R = 28, T = 20, B = 44;

/** p95 TTFT (hit) against N for each (config, run). Tick labels are data values only. */
export function CapacityCurve({ bench }: { bench: BenchData }) {
  const { report, evidence } = bench;
  const rows = report.levels.filter((r) => isNum(r.ttft_p95_hit_ms));
  if (!rows.length) return <p className="nodata">no data yet</p>;

  const series = new Map<string, LevelRow[]>();
  for (const r of rows) {
    const k = `${r.config}:${r.run}`;
    series.set(k, [...(series.get(k) ?? []), r].sort((a, b) => a.level - b.level));
  }
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const bar = report.bars.ttft_hit_ms;
  const dataMax = Math.max(...rows.map((r) => r.ttft_p95_hit_ms as number));
  const yMax = Math.max(bar, dataMax) * 1.08;
  const xMin = levels[0], xMax = levels[levels.length - 1];
  const x = (n: number) => (xMax === xMin ? (L + W - R) / 2 : L + ((n - xMin) / (xMax - xMin)) * (W - L - R));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const configs = [...new Set(rows.map((r) => r.config))].sort();
  const runsOf = (c: string) => [...series.keys()].filter((k) => k.startsWith(`${c}:`)).length;
  // Draw C last so it sits on top.
  const ordered = [...series.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <figure className="chart">
      <div className="legend" style={{ marginBottom: 8 }}>
        {configs.map((c) => (
          <span key={c}>
            <i className="sw" style={{ background: SWATCH[c] ?? "var(--subtle)" }} />
            config {c}
          </span>
        ))}
        <span>
          <i className="sw" style={{ background: "transparent", border: "1px dashed var(--subtle)" }} />
          latency bar
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="capacity curve">
        <defs>
          <linearGradient id="cc-brand" gradientUnits="userSpaceOnUse" x1={L} y1="0" x2={W - R} y2="0">
            <stop offset="0" stopColor="#fbb39c" />
            <stop offset="0.34" stopColor="#f472b6" />
            <stop offset="0.66" stopColor="#c084fc" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        {/* dashed grid at the bar and the top */}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--border-strong)" />
        <line x1={L} y1={y(bar)} x2={W - R} y2={y(bar)} stroke="var(--subtle)" strokeDasharray="5 5" opacity={0.7} />
        <text x={W - R} y={y(bar) - 8} textAnchor="end" className="lbl">TTFT bar</text>
        <a className="num" href={evidence.reportMd} target="_blank" rel="noreferrer">
          <text x={L - 8} y={y(bar) + 4} textAnchor="end" className="lbl-strong">{fmtInt(bar)}</text>
        </a>
        <text x={L - 8} y={H - B + 4} textAnchor="end" className="lbl">zero</text>
        {/* top tick: the largest measured tail, when it is above the bar */}
        {dataMax > bar && (
          <g>
            <line x1={L} y1={y(dataMax)} x2={W - R} y2={y(dataMax)} stroke="var(--border)" strokeDasharray="2 4" />
            <a className="num" href={evidence.turnsCsv} target="_blank" rel="noreferrer">
              <text x={L - 8} y={y(dataMax) + 4} textAnchor="end" className="lbl-strong">{fmtInt(dataMax)}</text>
            </a>
          </g>
        )}
        {/* x ticks: the measured levels */}
        {levels.map((n) => (
          <g key={n}>
            <line x1={x(n)} y1={T} x2={x(n)} y2={H - B} stroke="var(--border)" strokeDasharray="2 4" />
            <a className="num" href={evidence.turnsCsv} target="_blank" rel="noreferrer">
              <text x={x(n)} y={H - B + 18} textAnchor="middle" className="lbl-strong">{fmtInt(n)}</text>
            </a>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="lbl">concurrent sessions N</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="lbl">TTFT tail on hit, ms</text>
        {/* series */}
        {ordered.map(([k, pts]) => {
          const cfg = k.split(":")[0];
          const color = COLORS[cfg] ?? "var(--subtle)";
          const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p.level).toFixed(1)} ${y(p.ttft_p95_hit_ms as number).toFixed(1)}`).join(" ");
          return (
            <g key={k} opacity={runsOf(cfg) > 1 ? 0.85 : 1}>
              <path d={d} fill="none" stroke={color} strokeWidth={cfg === "C" ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => (
                <a key={`${k}:${p.level}`} className="num" href={evidence.turnsCsv} target="_blank" rel="noreferrer">
                  <title>{`config ${cfg}, run ${p.run}, N ${p.level}: ${fmt(p.ttft_p95_hit_ms)} ms`}</title>
                  <circle cx={x(p.level)} cy={y(p.ttft_p95_hit_ms as number)} r={4} fill={cfg === "C" ? "#f9a8d4" : color} stroke="var(--card)" strokeWidth={2} />
                </a>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Every measured level of every run. */
export function LevelsTable({ bench }: { bench: BenchData }) {
  const ev = bench.evidence.turnsCsv;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>config</th><th>run</th><th>N</th><th>turns</th><th>errors</th><th>TTFT median hit</th><th>TTFT tail hit</th><th>TTFT tail miss</th><th>tokens per s</th><th>KV reuse</th><th>result</th></tr>
        </thead>
        <tbody>
          {bench.report.levels.map((r) => (
            <tr key={`${r.config}:${r.run}:${r.level}`}>
              <td>{r.config}</td>
              <td><Num href={ev} value={r.run} /></td>
              <td><Num href={ev} value={fmtInt(r.level)} /></td>
              <td><Num href={ev} value={fmtInt(r.turns)} /></td>
              <td><Num href={ev} value={fmtInt(r.errors)} /></td>
              <td><Num href={ev} value={fmt(r.ttft_p50_hit_ms)} /></td>
              <td><Num href={ev} value={fmt(r.ttft_p95_hit_ms)} /></td>
              <td><Num href={ev} value={fmt(r.ttft_p95_miss_ms)} /></td>
              <td><Num href={ev} value={fmt(r.tokens_per_s)} /></td>
              <td><Num href={ev} value={fmt(r.kv_reuse_rate, 3)} /></td>
              <td>{r.pass ? <span className="badge badge-ok">pass</span> : <span className="badge badge-danger">fail</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
