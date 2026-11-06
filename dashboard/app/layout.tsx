import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { env, links, SNAPSHOT } from "@/lib/env";
import { fmtTs } from "@/lib/fmt";
import { getGateway, getLedger } from "@/lib/data";
import { TopBar, type EvidenceLink } from "./components/TopBar";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Headroom", template: "%s · Headroom" },
  description: "Memory-priced inference: capacity proof, live paid calls, Arc tab, baseline pricing and demand, every number linked to evidence.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [gw, ledger] = await Promise.all([getGateway(), getLedger()]);
  const evidence: EvidenceLink[] = [
    { label: "Repository", href: env.repoUrl },
    ...(SNAPSHOT
      ? []
      : [
          { label: "Pricing JSON", href: links.pricing },
          { label: "Health JSON", href: links.health },
        ]),
    { label: "Bench JSON", href: links.benchLatest },
    { label: "Ledger summary", href: links.ledgerSummary },
    ...(env.hcsTopicId ? [{ label: "HCS receipts topic", href: links.hashscanTopic(env.hcsTopicId) }] : []),
    ...(env.arcEscrowAddress ? [{ label: "Arc escrow", href: links.arcAddress(env.arcEscrowAddress) }] : []),
  ];
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {/* Shared gradients for the logo. Rendered at 0x0: display:none would disable them. */}
        <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden focusable="false">
          <defs>
            <linearGradient id="hr-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fbb39c" />
              <stop offset="0.34" stopColor="#f472b6" />
              <stop offset="0.66" stopColor="#c084fc" />
              <stop offset="1" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="hr-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.25" />
            </linearGradient>
            <filter id="hr-blur" x="-50%" y="-200%" width="200%" height="500%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
          </defs>
        </svg>
        <TopBar evidence={evidence} status={SNAPSHOT ? "snapshot" : gw.health.ok ? "online" : "offline"} />
        <div className="wrap">
          {SNAPSHOT ? (
            <div className="snapshot-note" role="status">
              <span className="dot" />
              <span>
                Public snapshot of the demo ledger, newest record{" "}
                <a className="num" href={links.ledgerSummary} target="_blank" rel="noreferrer">
                  {fmtTs(ledger?.summary.latest_record_at) ?? "unknown"}
                </a>
                . The gateway runs on the demo machine, so live prices are not shown here.
              </span>
            </div>
          ) : null}
          <main className="page">{children}</main>
          <footer className="foot">
            No figure on this dashboard is typed by hand. Dotted-underlined values link to the bench file, HashScan or Arc transaction, gateway
            JSON or ledger row they came from; missing data shows as “no data yet”.
          </footer>
        </div>
      </body>
    </html>
  );
}
