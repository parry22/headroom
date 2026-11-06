/** Read-only pre-flight for Spike B: HBAR and USDC balances and USDC association for the operator and agent accounts (mirror node). */
import { cfg } from "../src/config.js";
const MIRROR = cfg.hederaNetwork === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
const USDC = cfg.hederaUsdcTokenId;
async function check(label: string, id: string | undefined) {
  if (!id) { console.log(`${label}: not set in .env`); return false; }
  const acc: any = await (await fetch(`${MIRROR}/api/v1/accounts/${id}`)).json();
  if (!acc.account) { console.log(`${label} ${id}: account not found on ${cfg.hederaNetwork}`); return false; }
  const tok: any = await (await fetch(`${MIRROR}/api/v1/accounts/${id}/tokens?token.id=${USDC}`)).json();
  const assoc = tok.tokens?.[0];
  const hbar = Number(acc.balance?.balance ?? 0) / 1e8;
  const usdc = assoc ? Number(assoc.balance) / 1e6 : 0;
  const keyType = acc.key?._type;
  console.log(`${label} ${id}: key=${keyType} hbar=${hbar} usdc_associated=${!!assoc} usdc=${usdc} https://hashscan.io/${cfg.hederaNetwork}/account/${id}`);
  return true;
}
const a = await check("operator (payTo)", cfg.hederaOperatorId);
const b = await check("agent (payer)   ", process.env.AGENT_HEDERA_ID);
for (const [name, url] of [["facilitator", cfg.facilitatorUrl], ["fallback", cfg.fallbackFacilitatorUrl]]) {
  if (!url) continue;
  try { const s: any = await (await fetch(`${url}/supported`, { signal: AbortSignal.timeout(8000) })).json();
    const k = s.kinds?.find((x: any) => x.network === `hedera:${cfg.hederaNetwork}` && x.x402Version === 2);
    console.log(`${name} ${url}: hedera:${cfg.hederaNetwork} ${k ? `supported, feePayer=${k.extra?.feePayer}` : "NOT listed"}`);
  } catch (e) { console.log(`${name} ${url}: unreachable (${(e as Error).message})`); }
}
process.exit(a && b ? 0 : 1);
