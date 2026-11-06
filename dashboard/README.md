# Headroom dashboard

Public dashboard for Headroom (ETHGlobal Mumbai). Next.js App Router, TypeScript, plain CSS,
server-rendered on every request. Visual language follows the Concours product (near-black canvas,
hairline cards, one peach-to-indigo gradient for Headroom's own figures, Geist type).

## Pages

A read-only proof board: one sticky top bar with four tabs, the gateway status, and an Evidence
menu of raw sources. The page list lives in `lib/nav.ts`.

| Route | What it answers |
| --- | --- |
| `/` | The thesis as three linked claims (more sessions per GPU, lower cost per token, paid and settled on chain), a live feed of the newest paid calls, and who is paying |
| `/memory` | Capacity per config, gains, the capacity curve; per-level tables, tier hits, KV bytes and the formula check are folded below |
| `/payments` | Counts, how mode A (per request on Hedera) and mode B (tab on Arc) work, and one table switched between receipts (filterable by mode) and batches |
| `/pricing` | Baseline, cost and price ladder, baseline source, node throughput, unit rates, ledger cost against baseline |

Overview and Payments refresh themselves while open.

## Run

```sh
cd dashboard
pnpm install
pnpm dev          # http://localhost:3100 (next dev -p 3100)
pnpm build
pnpm start        # production server on port 3100
pnpm audit-links  # D2 check of every page against the running server (see below)
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
| `LEDGER_PATH` | `./gateway/ledger.db` | ledger SQLite file, relative to the repo root (absolute paths work too) |
| `NEXT_PUBLIC_REPO_URL` | `https://github.com/parry22/headroom` | base for links to `bench/results/<run>/report.md`, `turns.csv`, `metrics.csv`, `bench/results/correctness/latest.diff` |
| `TEAM_WALLETS` | empty | comma-separated buyer ids excluded from the demand section |
| `HCS_TOPIC_ID` | empty | links HCS sequence numbers to `https://hashscan.io/testnet/topic/<id>` |
| `ARC_ESCROW_ADDRESS` | empty | links to `https://explorer.testnet.arc.io/address/<addr>` |
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

`scripts/audit-links.mjs` fetches every page and table view (its route list mirrors `lib/nav.ts`), walks `<main>`,
and fails with exit code 1 listing every text node that contains a digit but has no
`<a class="num" href>` ancestor. It prints `audit-links: 0 unlinked across 5 pages` and exits 0
when clean. Evidence links open in a new tab so the reader keeps their place.

## Public snapshot deploy

Live at https://headroom-dashboard.vercel.app (Vercel project `headroom-dashboard`). The hosted copy cannot
reach the ledger or the gateway on the demo machine, so it serves a read-only snapshot:

```sh
pnpm snapshot                      # copies ../gateway/ledger.db and ../bench/results/latest.json into ./snapshot (gitignored)
vercel build --prod && vercel deploy --prebuilt --prod
```

`lib/env.ts` uses `./snapshot` only when the real ledger is absent, so local runs are unchanged. In snapshot mode the
top bar shows a "snapshot" badge, a banner gives the newest record time, gateway links are hidden and the live price
ladder is replaced by a notice. Re-run both commands to refresh the snapshot.

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
