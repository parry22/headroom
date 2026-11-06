import type { BenchData, LevelRow } from "@/lib/bench";
import { fmt, fmtInt, isNum } from "@/lib/fmt";

const COLORS: Record<string, string> = { A: "#3987e5", B: "#d95926", C: "#199e70" };
const W = 640, H = 300, L = 60, R = 20, T = 16, B = 44;

/** p95 TTFT (hit) against N for each (config, run). Tick labels are data values only. */
export function CapacityCurve({ bench }: { bench: BenchData }) {
  const { report, evidence } = bench;
  const rows = report.levels.filter((r) => isNum(r.ttft_p95_hit_ms));
  if (!rows.length) return <p className="muted">no data yet</p>;

  const series = new Map<string, LevelRow[]>();
  for (const r of rows) {
    const k = `${r.config}:${r.run}`;
    series.set(k, [...(series.get(k) ?? []), r].sort((a, b) => a.level - b.level));
  }
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const bar = report.bars.ttft_hit_ms;
  const yMax = Math.max(bar, ...rows.map((r) => r.ttft_p95_hit_ms as number));
  const xMin = levels[0], xMax = levels[levels.length - 1];
  const x = (n: number) => (xMax === xMin ? (L + W - R) / 2 : L + ((n - xMin) / (xMax - xMin)) * (W - L - R));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const configs = [...new Set(rows.map((r) => r.config))].sort();
  const runsOf = (c: string) => [...series.keys()].filter((k) => k.startsWith(`${c}:`)).length;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="capacity curve">
        <rect x={0} y={0} width={W} height={H} fill="var(--surface-1)" rx={6} />
        {/* axes */}
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--grid)" />
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--grid)" />
        {/* bar */}
        <line x1={L} y1={y(bar)} x2={W - R} y2={y(bar)} stroke="var(--text-secondary)" strokeDasharray="6 4" />
        <text x={W - R - 4} y={y(bar) - 6} textAnchor="end" className="lbl">bar</text>
        <a className="num" href={evidence.reportMd}>
          <text x={L - 6} y={y(bar) + 4} textAnchor="end" className="lbl">{fmtInt(bar)}</text>
        </a>
        {yMax !== bar && (
          <a className="num" href={evidence.turnsCsv}>
            <text x={L - 6} y={y(yMax) + 4} textAnchor="end" className="lbl">{fmtInt(yMax)}</text>
          </a>
        )}
        <text x={L - 6} y={H - B + 4} textAnchor="end" className="lbl">zero</text>
        {/* x ticks: the measured levels */}
        {levels.map((n) => (
          <g key={n}>
            <line x1={x(n)} y1={H - B} x2={x(n)} y2={H - B + 4} stroke="var(--grid)" />
            <a className="num" href={evidence.turnsCsv}>
              <text x={x(n)} y={H - B + 18} textAnchor="middle" className="lbl">{fmtInt(n)}</text>
            </a>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="lbl">concurrent sessions N</text>
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="lbl">TTFT tail on hit, ms</text>
        {/* series */}
        {[...series.entries()].map(([k, pts]) => {
          const cfg = k.split(":")[0];
          const color = COLORS[cfg] ?? "var(--text-secondary)";
          const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p.level).toFixed(1)} ${y(p.ttft_p95_hit_ms as number).toFixed(1)}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={k} opacity={runsOf(cfg) > 1 ? 0.8 : 1}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p) => (
                <a key={`${k}:${p.level}`} className="num" href={evidence.turnsCsv}>
                  <circle cx={x(p.level)} cy={y(p.ttft_p95_hit_ms as number)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
                </a>
              ))}
              <text x={x(last.level) + 8} y={y(last.ttft_p95_hit_ms as number) + 4} className="lbl" fill={color}>{cfg}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span className="legend">
          {configs.map((c) => (
            <span key={c}><i className="swatch" style={{ background: COLORS[c] ?? "var(--text-secondary)" }} /> config {c}</span>
          ))}
          <span className="muted">dashed line is the TTFT bar; each point is one level of one run; values in the table below</span>
        </span>
      </figcaption>
      <table className="dense">
        <thead>
          <tr><th>config</th><th>run</th><th>N</th><th>turns</th><th>errors</th><th>TTFT median hit</th><th>TTFT tail hit</th><th>TTFT tail miss</th><th>tokens per s</th><th>KV reuse</th><th>pass</th></tr>
        </thead>
        <tbody>
          {report.levels.map((r) => (
            <tr key={`${r.config}:${r.run}:${r.level}`}>
              <td>{r.config}</td>
              <td><a className="num" href={evidence.turnsCsv}>{r.run}</a></td>
              <td><a className="num" href={evidence.turnsCsv}>{fmtInt(r.level)}</a></td>
              <td><a className="num" href={evidence.turnsCsv}>{fmtInt(r.turns)}</a></td>
              <td><a className="num" href={evidence.turnsCsv}>{fmtInt(r.errors)}</a></td>
              <td><Cell href={evidence.turnsCsv} v={fmt(r.ttft_p50_hit_ms)} /></td>
              <td><Cell href={evidence.turnsCsv} v={fmt(r.ttft_p95_hit_ms)} /></td>
              <td><Cell href={evidence.turnsCsv} v={fmt(r.ttft_p95_miss_ms)} /></td>
              <td><Cell href={evidence.turnsCsv} v={fmt(r.tokens_per_s)} /></td>
              <td><Cell href={evidence.turnsCsv} v={fmt(r.kv_reuse_rate, 3)} /></td>
              <td>{r.pass ? "pass" : "fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Cell({ href, v }: { href: string; v: string | null }) {
  return v === null ? <span className="nodata">no data yet</span> : <a className="num" href={href}>{v}</a>;
}
