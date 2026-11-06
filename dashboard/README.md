# Headroom dashboard

Public dashboard for Headroom (ETHGlobal Mumbai). Next.js App Router, TypeScript, plain CSS,
server-rendered on every request. One page, five sections in demo order: memory proof,
live paid calls, tab on Arc, baseline and pricing, demand.

## Run

```sh
cd dashboard
pnpm install
pnpm dev          # http://localhost:3100 (next dev -p 3100)
pnpm build
pnpm start        # production server on port 3100
pnpm audit-links  # D2 check against the running server (see below)
```

Node 22.13 or newer is required: the ledger is read with the built-in `node:sqlite`
(prints an `ExperimentalWarning`, no native module to build).

## Data sources

All paths are relative to the repo root, which is the parent of this directory.

| Source | What it feeds |
| --- | --- |
| `bench/results/latest.json` (written by `bench/report.py`) | capacity curve, capacity points, gains, tier hits, KV bytes per token, capacity formula check |
| gateway ledger SQLite (`LEDGER_PATH`) | paid request counts, tokens served, receipts, batches, cost against baseline, external wallets |
| gateway `GET /pricing` and `GET /health` (`GATEWAY_URL`, two second timeout) | rates, baseline, throughput, price version, online badge |

If a source is missing the page shows "no data yet" (or "gateway offline"), never a placeholder number.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_URL` | `http://localhost:3000` | gateway base URL for `/pricing`, `/health`, `/bench/latest` |
| `LEDGER_PATH` | `../gateway/ledger.db` | ledger SQLite file, relative to `dashboard/` |
| `NEXT_PUBLIC_REPO_URL` | `https://github.com/parry/headroom` | base for links to `bench/results/<run>/report.md`, `turns.csv`, `metrics.csv`, `bench/results/correctness/latest.diff` |
| `TEAM_WALLETS` | empty | comma-separated buyer ids excluded from the demand section |
| `HCS_TOPIC_ID` | empty | links HCS sequence numbers to `https://hashscan.io/testnet/topic/<id>` |
| `ARC_ESCROW_ADDRESS` | empty | links to `https://explorer.testnet.arc.io/address/<addr>` |
| `ARC_STUDIO_PROJECT_URL` | empty | Arc Studio project link |
| `DASHBOARD_FIXTURES` | unset | `1` enables the sample fixtures below when the real files are missing |
| `DASHBOARD_URL` | `http://localhost:3100` | used only by `scripts/audit-links.mjs` |

## The D2 rule: no hard-coded numbers

Every number rendered inside `<main>` is wrapped in `<a class="num" href="...">` whose href is
the evidence it came from: a bench file on the repo, a HashScan transaction, an Arc explorer
transaction, the gateway `/pricing` or `/health` JSON, or this app's own `/api/ledger-summary`
route, which returns the aggregates together with the SQL that produced them
(`?request_id=` and `?batch_id=` return a single row). No number is typed by hand or computed
from a constant in the dashboard code; the only arithmetic is unit presentation
(micro-USDC to USDC, fraction to percent, epoch to ISO time). Prose avoids digits so the audit
stays simple ("two" not "2", no dates outside anchors).

`scripts/audit-links.mjs` fetches the page, walks `<main>`, and fails with exit code 1 listing
every text node that contains a digit but has no `<a class="num" href>` ancestor. It prints
`audit-links: 0 unlinked` and exits 0 when clean.

## Fixtures

`fixtures/latest.json` (two configs, one level each) and `fixtures/make-ledger.mjs` (writes
`fixtures/ledger.db` with three usage records and one batch) exist so the page can be exercised
without a GPU node. They are used only when `DASHBOARD_FIXTURES=1` is set AND the real file is
missing; the page then shows a "sample fixture" badge. `pnpm fixtures` builds the sample ledger
by hand; the server also builds it on first use when fixtures are enabled.

```sh
DASHBOARD_FIXTURES=1 pnpm start
node scripts/audit-links.mjs
```
