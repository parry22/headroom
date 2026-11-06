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

## Payment flow (x402 v2 on Hedera, Mode A)

1. `POST /v1/chat/completions` with no payment: the gateway tokenizes the prompt (vLLM `/tokenize`, CPU only), checks the buyer's caps, and returns `402` with a `PAYMENT-REQUIRED` header: `scheme exact`, `network hedera:testnet`, `asset 0.0.429274` (USDC via HTS), `amount` = the exact micro-USDC quote, `payTo` = operator account, `extra.feePayer` = facilitator, `extra.paymentFlow = upfront`, 60 s timeout.
2. The agent's x402 client builds a partially signed HTS transfer and retries with `PAYMENT-SIGNATURE`.
3. The gateway rejects replays, then the facilitator verifies and settles the transfer on Hedera. Only after settlement does the request reach vLLM; `PAYMENT-RESPONSE` (with the Hedera transaction id) is sent before the first token.
4. The meter records tokens, cached tokens, tier hits, latency and price; an EIP-712 receipt is signed; one message goes to the HCS audit topic.

Quote formula, published at `/pricing`: `q = ceil((r_in × prompt_tokens + r_out × max_tokens) / 1e6)` micro-USDC. `make audit-prices` recomputes it from the ledger.

Spend controls: `PUT /v1/budget` (daily cap, per-request max, model allowlist), `X-Headroom-Max-Price` header. Over-cap requests are refused before any quote. `make caps-test` proves the vLLM counter does not move.

Tab mode (Arc): deposit USDC into the escrow, register a session key, send requests with `X-Headroom-Tab` (EIP-712). The signer posts a Merkle root per batch; any record can be challenged with a proof and the signed receipt; `make settle-demo` runs the whole lifecycle, `make reconcile` checks the accounting identity.

## Settled transactions and Arc Studio

Every entry below is a real testnet transaction. Arc Studio URL and the CRE simulation log are added as those gates pass.

**Hedera x402 (Spike B, 2026-11-06).** Real x402 v2 `exact` payments in HTS USDC (`0.0.429274`) from the demo agent `0.0.11334561` to the operator `0.0.11334469`, verified and settled by the Blocky402 testnet facilitator (fee payer `0.0.7162784`), with `paymentFlow: upfront`. In this spike inference came from a local fake vLLM (no GPU yet); the payment path has no mocks. Replaying a used payment returns `402 payment_replayed`.

- https://hashscan.io/testnet/transaction/0.0.7162784@1793945676.464874990 (first settlement: 5 micro-USDC agent to operator)
- https://hashscan.io/testnet/transaction/0.0.7162784@1793945730.865773365
- https://hashscan.io/testnet/transaction/0.0.7162784@1793945757.475561626
- https://hashscan.io/testnet/transaction/0.0.7162784@1793945812.185413823
- https://hashscan.io/testnet/transaction/0.0.7162784@1793945878.139851347
- https://hashscan.io/testnet/transaction/0.0.7162784@1793946015.228065975

**HCS audit topics.** Spike: https://hashscan.io/testnet/topic/0.0.11335247 (7 spike records, 7 messages). Production ledger: https://hashscan.io/testnet/topic/0.0.11336690, one message per paid request (70 done records, 70 messages on 2026-11-06 14:32 IST).

**Demo agent, 50 unattended paid requests (P2, P3; 2026-11-06 14:17 IST).** `agent/src/agent.ts` ran 20 turns (exit 0), then 30 more before the gateway's context cap refused turn 31 with `400 context_too_long`. Every turn paid in HTS USDC through Blocky402; inference was the local fake vLLM (no GPU yet). `make audit-prices`: `sampled=50 mismatches=0`. Logs with all 50 transaction ids: `docs/evidence/2026-11-06/demo-*.jsonl`. First and last: https://hashscan.io/testnet/transaction/0.0.7162784@1793954816.086040213, https://hashscan.io/testnet/transaction/0.0.7162784@1793955006.870343589

**Arc tab lifecycle on the reference escrow (S2, S3, S4, S5; 2026-11-06 14:21–14:32 IST).** `contracts/reference/HeadroomEscrow.sol` implements `contracts/IHeadroomEscrow.sol` and passes 12 Foundry tests (`make escrow-test`). It is a rehearsal contract written in this repo, not the Arc Studio submission (S1 is still open); the Studio contract replaces it by changing `ARC_ESCROW_ADDRESS`. `make settle-demo` output: `docs/evidence/2026-11-06/settle-demo-1793955725459.json`.

- Deploy: https://explorer.testnet.arc.io/tx/0x71180ce68fe6cfb70a78098bdfbb82add98dfa9741ad0fbedb93902ef57e54f0 (escrow `0xfa7b11252defd7ce61d271f2cbfc8eab7a5acb6f`)
- Bond: https://explorer.testnet.arc.io/tx/0x9bbd587ad57cf49071f996e24f3c9f318cf2c2b4f89664360922a0fb60b653b4
- Deposit 2 USDC: https://explorer.testnet.arc.io/tx/0x618b126848cf44905c8ee8b5e25db943c3acb51c366cfc46bd6a8854a9f5fad0
- Session key: https://explorer.testnet.arc.io/tx/0xf729ad5a1eac33ee5ed6cbe92d6b28c4dc8198d860e9be13c873422ef2d0d348
- Wrong batch posted (one leaf overpriced): https://explorer.testnet.arc.io/tx/0xb4cb88105f9ec585a538fdf44bae607dbc986ea524e6591f0664afb5a7b9854a
- Clean batch posted: https://explorer.testnet.arc.io/tx/0xea7f6cac5b54510da1ec768cb11a662a32742d89e00ef515c7f710dcc032f683
- Challenged and refunded (Merkle proof + signed receipt, 155 refunded + 0.10 USDC penalty): https://explorer.testnet.arc.io/tx/0x47f61d189681b5fe547b728193c4890c2d15fdb68121736adeab3edffe6cd271
- Released after the 600 s window: https://explorer.testnet.arc.io/tx/0x8ffe44187871da8591b9f2c5bb1d5a9c496160356475dd400e12698c5fdef097
- `make reconcile`: PASS, `2100000 == 2100000` (`docs/evidence/2026-11-06/reconcile-1793955730860.json`)
- S5 on chain: `postBatch(amount=10, baselineAmount=9)` reverts with `AboveBaseline()` (`0xc88db978`)

**Price baseline (D1), manual relay.** Live Vast.ai on-demand medians (H100 SXM $3.668/h, H200 $4.002/h) written with `setBaseline` by the operator, labelled `source: manual-relay` (`cre login` still pending, so no CRE run yet): https://explorer.testnet.arc.io/tx/0x91ecefa098134ed6add2d025cae75b6ead93012b9da88dd39d135c185a5638d3, https://explorer.testnet.arc.io/tx/0x09eea0bda3ba8c4396cb219999d52d4cef02f1445eda7162661bda2651c69500

**Arc testnet funding.** Operator `0x3F3A94169113A84fd54D257c018c62cFBc30D0EB` and demo buyer `0xBfa851839FDE3F1A21de800b196139337c519625`, 20 USDC each from faucet.circle.com.

## AI use

See `docs/ai-disclosure.md`.
