import type { BenchData } from "@/lib/bench";
import { fmtInt, isNum } from "@/lib/fmt";

const NAMES: Record<string, string> = { A: "A · naive baseline", B: "B · tuned baseline", C: "C · Headroom tiers" };

/** Capacity N per config as cylinder bars. Bar height is presentation only; the label above links to the report. */
export function CapacityBars({ bench }: { bench: BenchData }) {
  const configs = ["A", "B", "C"].filter((c) => c in bench.report.capacity || bench.report.levels.some((l) => l.config === c));
  const vals = configs.map((c) => bench.report.capacity[c]);
  const max = Math.max(1, ...vals.filter(isNum));
  const href = bench.evidence.reportMd;
  return (
    <div className="cyl-chart" role="img" aria-label="capacity per config">
      {[0.25, 0.5, 0.75].map((f) => (
        <div key={f} className="grid-line" style={{ bottom: `calc(${f} * (100% - 52px) + 36px)` }} />
      ))}
      {configs.map((c) => {
        const v = bench.report.capacity[c];
        return (
          <div className="cyl-col" key={c}>
            <span className="val">
              {isNum(v) ? (
                <a className="num" href={href} target="_blank" rel="noreferrer" title="Open report.md">
                  {fmtInt(v)}
                </a>
              ) : (
                <span className="nodata">none</span>
              )}
            </span>
            {isNum(v) ? (
              <div className={`cyl ${c === "C" ? "cyl-brand" : "cyl-grey"}`} style={{ height: `calc(${Math.max(0.06, v / max)} * (100% - 64px))` }} />
            ) : (
              <div className="cyl cyl-empty" />
            )}
            <span className="lbl">{NAMES[c] ?? c}</span>
          </div>
        );
      })}
    </div>
  );
}
