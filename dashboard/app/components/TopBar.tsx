"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PAGES } from "@/lib/nav";
import { External } from "./icons";
import { Logo } from "./Logo";

export type EvidenceLink = { label: string; href: string };

export function TopBar({ evidence, status }: { evidence: EvidenceLink[]; status: "online" | "offline" | "snapshot" }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="row">
          <Link href="/" className="brand" aria-label="Headroom overview">
            <Logo />
            <span className="brand-name">Headroom</span>
          </Link>
          <Tabs className="tabs tabs-inline" />
          <div className="right">
            {status === "snapshot" ? (
              <span className="badge badge-accent" title="Read-only copy of the demo ledger">
                <span className="dot" />
                snapshot
              </span>
            ) : status === "online" ? (
              <span className="badge badge-ok" title="Gateway /health answered">
                <span className="dot" />
                gateway online
              </span>
            ) : (
              <span className="badge badge-warn" title="Gateway /health did not answer">
                <span className="dot" />
                gateway offline
              </span>
            )}
            <EvidenceMenu evidence={evidence} />
          </div>
        </div>
      </div>
      <div className="tabs-row">
        <div className="wrap">
          <Tabs className="tabs" />
        </div>
      </div>
    </header>
  );
}

function Tabs({ className }: { className: string }) {
  const pathname = usePathname();
  return (
    <nav className={className} aria-label="Dashboard">
      {PAGES.map((p) => (
        <Link key={p.href} href={p.href} className="tab" aria-current={pathname === p.href ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** Raw sources behind the dashboard, one click away from every page. Closes on outside click, Escape or navigation. */
function EvidenceMenu({ evidence }: { evidence: EvidenceLink[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary>
        Evidence
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="menu-panel">
        <div className="hint">Raw sources. Every figure on the page also links to its own.</div>
        {evidence.map((e) => (
          <a key={e.label} href={e.href} target="_blank" rel="noreferrer">
            {e.label}
            <External />
          </a>
        ))}
      </div>
    </details>
  );
}
