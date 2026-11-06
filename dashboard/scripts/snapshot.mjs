#!/usr/bin/env node
// Copy the real ledger and bench report into ./snapshot for a hosted, read-only deploy.
// The ledger is copied with VACUUM INTO so rows still in the WAL are included, then switched to a
// rollback journal so it opens read-only on a read-only filesystem.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const repo = path.resolve(process.cwd(), "..");
const src = path.resolve(repo, process.env.LEDGER_PATH || "./gateway/ledger.db");
const bench = path.join(repo, "bench", "results", "latest.json");
const out = path.join(process.cwd(), "snapshot");

if (!fs.existsSync(src)) {
  console.error(`snapshot: no ledger at ${src}`);
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const dst = path.join(out, "ledger.db");
const db = new DatabaseSync(src, { readOnly: true });
db.exec(`VACUUM INTO '${dst.replace(/'/g, "''")}'`);
db.close();
const copy = new DatabaseSync(dst);
copy.exec("PRAGMA journal_mode=DELETE");
const n = copy.prepare("SELECT COUNT(*) AS n FROM usage_record").get().n;
copy.close();

if (fs.existsSync(bench)) fs.copyFileSync(bench, path.join(out, "latest.json"));
console.log(`snapshot: ${n} usage records -> ${path.relative(process.cwd(), dst)}${fs.existsSync(bench) ? ", bench latest.json copied" : ""}`);
