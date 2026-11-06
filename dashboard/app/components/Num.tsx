import type { ReactNode } from "react";

/**
 * D2 rule: every digit shown inside <main> lives in <a class="num" href=evidence>.
 * `value` null renders the "no data yet" placeholder instead (never a number).
 */
export function Num({ href, value, title, children }: { href: string; value?: string | null; title?: string; children?: ReactNode }) {
  if (value === null || (value === undefined && children === undefined)) return <NoData />;
  return (
    <a className="num" href={href} title={title} rel="noreferrer">
      {value ?? children}
    </a>
  );
}

export function NoData({ text = "no data yet" }: { text?: string }) {
  return <span className="nodata">{text}</span>;
}

export function Tag({ kind, children }: { kind: "warn" | "ok" | "muted"; children: ReactNode }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}
