import fs from "node:fs";
import path from "node:path";

/** Repo root when running inside dashboard/ (`pnpm dev` / `pnpm start`). */
export const REPO_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..");

const str = (k: string, d = ""): string => {
  const v = process.env[k];
  return v === undefined || v === "" ? d : v;
};

export const env = {
  repoUrl: str("NEXT_PUBLIC_REPO_URL", "https://github.com/parry22/headroom").replace(/\/$/, ""),
  gatewayUrl: str("GATEWAY_URL", "http://localhost:3000").replace(/\/$/, ""),
  ledgerPath: path.resolve(/*turbopackIgnore: true*/ process.cwd(), str("LEDGER_PATH", "../gateway/ledger.db")),
  benchLatest: path.join(REPO_ROOT, "bench", "results", "latest.json"),
  teamWallets: str("TEAM_WALLETS").split(",").map((s) => s.trim()).filter(Boolean),
  hcsTopicId: str("HCS_TOPIC_ID"),
  arcStudioUrl: str("ARC_STUDIO_PROJECT_URL"),
  arcEscrowAddress: str("ARC_ESCROW_ADDRESS"),
  fixtures: str("DASHBOARD_FIXTURES") === "1",
};

export const FIXTURE_BENCH = path.join(process.cwd(), "fixtures", "latest.json");
export const FIXTURE_LEDGER = path.join(process.cwd(), "fixtures", "ledger.db");

/** Real bench report if present; the fixture only when DASHBOARD_FIXTURES=1; else null. */
export function benchPath(): string | null {
  if (fs.existsSync(/*turbopackIgnore: true*/ env.benchLatest)) return env.benchLatest;
  if (env.fixtures && fs.existsSync(FIXTURE_BENCH)) return FIXTURE_BENCH;
  return null;
}

export const links = {
  hashscanTx: (tx: string) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`,
  hashscanAccount: (id: string) => `https://hashscan.io/testnet/account/${encodeURIComponent(id)}`,
  hashscanTopic: (topic: string) => `https://hashscan.io/testnet/topic/${encodeURIComponent(topic)}`,
  arcTx: (hash: string) => `https://explorer.testnet.arc.io/tx/${encodeURIComponent(hash)}`,
  arcAddress: (addr: string) => `https://explorer.testnet.arc.io/address/${encodeURIComponent(addr)}`,
  pricing: `${env.gatewayUrl}/pricing`,
  health: `${env.gatewayUrl}/health`,
  benchLatest: `${env.gatewayUrl}/bench/latest`,
  ledgerSummary: "/api/ledger-summary",
  record: (id: string) => `/api/ledger-summary?request_id=${encodeURIComponent(id)}`,
  batch: (id: string) => `/api/ledger-summary?batch_id=${encodeURIComponent(id)}`,
  correctnessDiff: `${env.repoUrl}/blob/main/bench/results/correctness/latest.diff`,
  benchFile: (runDir: string, file: string) => `${env.repoUrl}/blob/main/bench/results/${encodeURIComponent(runDir)}/${file}`,
};

/** Hedera account ids look like 0.0.123; EVM addresses like 0xabc... */
export function buyerLink(buyer: string): string {
  if (/^\d+\.\d+\.\d+$/.test(buyer)) return links.hashscanAccount(buyer);
  if (/^0x[0-9a-fA-F]{40}$/.test(buyer)) return links.arcAddress(buyer);
  return links.ledgerSummary;
}
