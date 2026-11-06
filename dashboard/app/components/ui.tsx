import type { ReactNode } from "react";
import { External } from "./icons";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {children ? <p className="lede">{children}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, sub, actions, children, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {title || actions ? (
        <header className="card-head">
          <div style={{ minWidth: 0 }}>
            {title ? <h2>{title}</h2> : null}
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          {actions ? <div className="actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, small }: { label: ReactNode; value: ReactNode; hint?: ReactNode; small?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={small ? "stat-value small" : "stat-value"}>{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

/** Label / value rows for secondary figures. */
export function KV({ rows }: { rows: { label: ReactNode; value: ReactNode; small?: boolean }[] }) {
  return (
    <dl className="kv">
      {rows.map((r, i) => (
        <div key={i}>
          <dt>{r.label}</dt>
          <dd className={r.small ? "small" : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The figure that leads a page: a label chip, the big gradient number, a line under it. */
export function ResultFigure({ label, value, unit, line }: { label: ReactNode; value: ReactNode; unit?: ReactNode; line?: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span className="figure-label">{label}</span>
      <div className="figure-value">
        <span className="text-gradient">
          {value}
          {unit ? <span className="unit">{unit}</span> : null}
        </span>
      </div>
      {line ? <div className="figure-line">{line}</div> : null}
    </div>
  );
}

/** External evidence links as chips. */
export function Evidence({ items }: { items: { label: string; href: string | null | undefined }[] }) {
  const shown = items.filter((i): i is { label: string; href: string } => Boolean(i.href));
  if (!shown.length) return null;
  return (
    <div className="chips">
      {shown.map((i) => (
        <a key={i.label} className="chip" href={i.href} target="_blank" rel="noreferrer">
          {i.label}
          <External />
        </a>
      ))}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "warn"; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role="status">
      <span className="dot" />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
