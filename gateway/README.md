# Gateway

x402 v2 gateway, pricing, spend caps, meter and HCS audit log in front of the vLLM node.

| Path | Role |
| --- | --- |
| `src/app.ts` | routes; the Mode A request flow: caps → quote → 402 / verify + settle (upfront) → stream → record → receipt → HCS |
| `src/x402.ts` | `@x402/core` resource server, Hedera exact scheme, dynamic per-request price, `paymentFlow: upfront` |
| `src/pricing.ts` | PRD 7.4 formula, integer rates in micro-USD per 1M tokens, exact quote math |
| `src/pricingService.ts` | rate table from CRE price snapshots + `bench/results/latest.json`; `/pricing` |
| `src/caps.ts` | daily cap, per-request max price header, model allowlist; checked before quoting |
| `src/ledger.ts` | SQLite (`node:sqlite`) usage records, budgets, price versions, replay set, batches |
| `src/receipt.ts` | EIP-712 receipt + Merkle leaf hash shared with the signer and escrow |
| `src/hcs.ts` | async HCS submit per paid request, `hcs_seq` stored on the record |
| `scripts/` | `audit-prices` (P3), `caps-test` (P4), `replay-test` (P5), `hcs-create-topic` |
| `test/` | unit + flow tests with a fake facilitator and fake vLLM (tests only) |

## Flow (Mode A)

1. `POST /v1/chat/completions` without `PAYMENT-SIGNATURE`: tokenize via vLLM `/tokenize` (CPU), check caps, quote `q = ceil((r_in·prompt + r_out·max_tokens)/1e6)` micro-USDC, return `402` with `PAYMENT-REQUIRED` (`network hedera:testnet`, `asset 0.0.429274`, `amount q`, `payTo` operator, `extra.feePayer` from the facilitator, `extra.paymentFlow: upfront`).
2. Retry with `PAYMENT-SIGNATURE`: replay set, facilitator `/verify`, facilitator `/settle` (USDC moves on Hedera), then and only then the request is forwarded to vLLM. `PAYMENT-RESPONSE` carries the transaction id before the first token.
3. After the stream, the record is finalized, an EIP-712 receipt is signed (final SSE event `headroom_receipt`, also in `/v1/usage`), and one HCS message is queued.

Request headers: `X-Headroom-Buyer` (Hedera account id, enables caps), `X-Headroom-Max-Price` (micro-USDC), `Idempotency-Key`.

## Run

```bash
pnpm install
pnpm test                     # fakes only
pnpm start                    # needs .env, vLLM, facilitator reachable
pnpm hcs-create-topic         # once; put HCS_TOPIC_ID in .env
```
