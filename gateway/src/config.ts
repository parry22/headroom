import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
loadDotenv({ path: path.join(REPO_ROOT, ".env") });

const env = (k: string, d?: string): string => {
  const v = process.env[k];
  if (v === undefined || v === "") {
    if (d !== undefined) return d;
    throw new Error(`missing env ${k} (see .env.example)`);
  }
  return v;
};
const num = (k: string, d: number): number => Number(env(k, String(d)));

export const cfg = {
  port: num("GATEWAY_PORT", 3000),
  publicUrl: env("GATEWAY_PUBLIC_URL", "http://localhost:3000"),
  vllmUrl: env("VLLM_URL", "http://localhost:8000"),
  lmcacheMetricsUrl: env("LMCACHE_METRICS_URL", "http://localhost:8080/metrics"),
  model: env("MODEL", "RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8"),
  maxModelLen: num("MAX_MODEL_LEN", 40960),
  maxOutputTokens: num("MAX_OUTPUT_TOKENS", 2048),
  ledgerPath: path.resolve(REPO_ROOT, env("LEDGER_PATH", "./gateway/ledger.db")),
  benchLatest: path.join(REPO_ROOT, "bench", "results", "latest.json"),
  // pricing
  k: num("OPERATOR_SHARE_K", 0.3),
  m: num("MIN_MARGIN_M", 0.1),
  gpuUsdPerHr: num("GPU_USD_PER_HR", 0),
  hostUsdPerHr: num("HOST_RAM_NVME_USD_PER_HR", 0),
  baselineStaleSeconds: num("BASELINE_STALE_SECONDS", 3600),
  bootstrapTokensPerHrB: num("BOOTSTRAP_TOKENS_PER_HR_B", 0),
  bootstrapTokensPerHrC: num("BOOTSTRAP_TOKENS_PER_HR_C", 0),
  // hedera
  hederaNetwork: env("HEDERA_NETWORK", "testnet"),
  hederaOperatorId: env("HEDERA_OPERATOR_ID", ""),
  hederaOperatorKey: env("HEDERA_OPERATOR_KEY", ""),
  hederaUsdcTokenId: env("HEDERA_USDC_TOKEN_ID", "0.0.429274"),
  facilitatorUrl: env("X402_FACILITATOR_URL", "https://api.testnet.blocky402.com"),
  fallbackFacilitatorUrl: env("X402_FALLBACK_FACILITATOR_URL", ""),
  hcsTopicId: env("HCS_TOPIC_ID", ""),
  hcsBaselineTopicId: env("HCS_BASELINE_TOPIC_ID", ""),
  // receipts
  receiptSigningKey: env("RECEIPT_SIGNING_KEY", ""),
  // arc
  arcEscrowAddress: env("ARC_ESCROW_ADDRESS", ""),
  arcChainId: num("ARC_CHAIN_ID", 5042002),
};
export const caip2 = `hedera:${cfg.hederaNetwork}`;
