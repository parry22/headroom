import type { ReactNode } from "react";

/**
 * D2 rule: every digit shown inside <main> lives in <a class="num" href=evidence>.
 * `value` null renders the "no data yet" placeholder instead (never a number).
 * Evidence opens in a new tab so the reader keeps their place on the dashboard.
 */
export function Num({ href, value, title, children, className }: { href: string; value?: string | null; title?: string; children?: ReactNode; className?: string }) {
  if (value === null || (value === undefined && children === undefined)) return <NoData />;
  return (
    <a className={className ? `num ${className}` : "num"} href={href} title={title ?? "Open the evidence for this figure"} target="_blank" rel="noreferrer">
      {value ?? children}
    </a>
  );
}

export function NoData({ text = "no data yet" }: { text?: string }) {
  return <span className="nodata">{text}</span>;
}

type Kind = "warn" | "ok" | "muted" | "accent" | "danger";

export function Tag({ kind, children, dot, title }: { kind: Kind; children: ReactNode; dot?: boolean; title?: string }) {
  const cls = kind === "muted" ? "neutral" : kind;
  return (
    <span className={`badge badge-${cls}`} title={title}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}
