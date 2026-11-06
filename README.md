# Headroom

Long-context inference on cheap memory, sold per token to agents.

One GPU node runs vLLM + LMCache so only hot KV cache sits in HBM; warm KV parks in CPU DRAM and cold KV on NVMe. Agents pay per request over x402 on Hedera testnet (USDC via HTS), or run a tab that settles in USDC on Arc testnet through a savings-share escrow. A Chainlink CRE workflow sets the H200-equivalent price baseline.

Built at ETHGlobal Mumbai, 6 to 8 Nov 2026. Tracks: Hedera x402, Arc advanced stablecoin logic (Arc Studio), Chainlink CRE.

## Status

Not yet demoable. See `docs/PRD.md` section 8 for the depth bar and `docs/check-log.md` for the latest check run.

## Layout

| Dir | What |
| --- | --- |
| `docs/` | PRD, architecture, check log, AI disclosure |
| `infra/` | pinned vLLM + LMCache image, configs A/B/C, node scripts |
| `bench/` | replay harness, metrics scraper, report, raw results |
| `gateway/` | x402 gateway, pricing, caps, meter, HCS log |
| `signer/` | Merkle batch signer and Arc reconcile |
| `contracts/` | read-only mirror of the Arc Studio escrow (source of truth is Studio) |
| `cre/` | Chainlink CRE price-baseline workflow |
| `agent/` | demo buyer agent |
| `dashboard/` | public dashboard |
| `scripts/` | top-up, depth check |

## Make targets

`bench`, `bench-smoke`, `correctness`, `audit-prices`, `caps-test`, `replay-test`, `reconcile`, `demo`, `settle-demo`. Run `make help`.

## Setup

1. `cp .env.example .env` and fill it. Secrets never go in the repo.
2. Node: see `infra/README.md` (written in commit 2).
3. Gateway, signer, agent, dashboard: `pnpm install` in each.

## Payment flow, transactions, Arc Studio URL

Filled in as gates pass.

## AI use

See `docs/ai-disclosure.md`.
