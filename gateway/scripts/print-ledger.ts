/** Print usage records and HashScan links from a ledger. Usage: tsx scripts/print-ledger.ts [path, default LEDGER_PATH] */
import { Ledger } from "../src/ledger.js";
import { cfg } from "../src/config.js";

const l = new Ledger(process.argv[2] ?? cfg.ledgerPath);
const rows = l.db.prepare("select request_id,buyer,price,payment_tx,payment_asset,status,prompt_tokens,completion_tokens from usage_record").all() as { payment_tx: string | null }[];
for (const r of rows) console.log(JSON.stringify(r));
for (const r of rows) if (r.payment_tx) console.log("https://hashscan.io/testnet/transaction/" + r.payment_tx);
