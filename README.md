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

**HCS audit topic.** https://hashscan.io/testnet/topic/0.0.11335247: one message per paid request. After the spike runs: 6 paid records, 6 topic messages.

**Arc testnet funding.** Operator `0x3F3A94169113A84fd54D257c018c62cFBc30D0EB` and demo buyer `0xBfa851839FDE3F1A21de800b196139337c519625`, 20 USDC each from faucet.circle.com.

## AI use

See `docs/ai-disclosure.md`.
