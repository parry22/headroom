/** P3: charged amount equals the published formula from the recorded token counts, to 1 micro-USDC, on 50 sampled records. */
import { cfg } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { quoteMicro } from "../src/pricing.js";

const ledger = new Ledger(process.env.LEDGER_PATH_OVERRIDE ?? cfg.ledgerPath);
const n = Number(process.env.AUDIT_SAMPLE ?? 50);
const rows = ledger.sample(n);
let mismatches = 0;
for (const r of rows) {
  const expected = quoteMicro(r.unit_prices.r_in, r.unit_prices.r_out, r.quoted_prompt_tokens, r.max_tokens);
  const pv = ledger.priceVersion(r.unit_prices.price_version);
  const versionOk = pv && pv.r_in === r.unit_prices.r_in && pv.r_out === r.unit_prices.r_out;
  if (expected !== r.price || !versionOk) {
    mismatches++;
    console.log(`MISMATCH ${r.request_id} price=${r.price} expected=${expected} version_ok=${versionOk} tx=${r.payment_tx}`);
  }
}
console.log(`audit-prices: sampled=${rows.length} requested=${n} mismatches=${mismatches} formula=ceil((r_in*quoted_prompt_tokens + r_out*max_tokens)/1e6)`);
if (rows.length === 0) { console.log("audit-prices: no paid records yet"); process.exit(2); }
process.exit(mismatches ? 1 : 0);
