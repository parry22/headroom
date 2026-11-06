#!/usr/bin/env node
// Usage: node fixtures/make-ledger.mjs [out.db]   (default: fixtures/ledger.db)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtureLedger } from "./ledger-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, "ledger.db"));
buildFixtureLedger(out);
console.log(`fixture ledger written: ${out}`);
