# Headroom handoff

Written 2026-11-06 ~11:00 IST by the previous agent session. Read this, then `docs/HUMAN-TASKS.md`, then `git log --oneline`. Deadline: **Sunday 2026-11-08 09:00 IST** (ETHGlobal Mumbai submission). The full plan with gates, cut order and risks is in `~/.claude/plans/users-parry-downloads-headroom-prd-long-lucky-quokka.md`; the PRD is `docs/PRD.md`. Section 8 of the PRD is the acceptance contract (check IDs M1–E4).

## 1. What Headroom is, in three lines

Long-context inference on one GPU with vLLM + LMCache: hot KV in HBM, warm KV in CPU DRAM, cold KV on NVMe. Sold per token to agents: pay-per-request over x402 on Hedera testnet (USDC via HTS), or a tab settled in USDC on Arc testnet through a savings-share escrow built in Arc Studio. A Chainlink CRE workflow sets the H200-equivalent price baseline. Three partner picks: Hedera x402 (primary), Arc advanced stablecoin logic, Chainlink CRE.

## 2. Hard rules the previous session followed (keep them)

- No mocked facilitator, simulated payment or hand-typed dashboard number in the demo path. Fakes exist only under `gateway/test/` and `bench/tests/` and are used only by tests and by `scripts/spike-b.sh` for the *inference* side of the Hedera spike.
- Benchmark configs A, B, C differ only in KV precision and offload. B is the denominator for every gain claim. Never loosen a bar from PRD sections 3 or 8.
- The Arc escrow contract is written, tested and deployed in Arc Studio by the human. The repo holds only `contracts/IHeadroomEscrow.sol` (the interface the code targets) and `contracts/STUDIO-PROMPT.md` (the brief to paste into Studio).
- Secrets live only in `.env` (git-ignored). Never paste private keys into chat.
- Make targets are fixed names: `bench bench-smoke correctness audit-prices caps-test replay-test reconcile demo settle-demo` plus `depth-check`, `gateway-test`, `bench-test`.
- Every commit by an agent ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (change the model name to yours). The human should also commit in their own name regularly (check E2: no commit gap over 3 hours, no single-hour drop).

## 3. Repo map and state (all committed on `main`, 13 commits, nothing pushed to a remote yet)

| Dir | What | Verified how |
| --- | --- | --- |
| `infra/` | `run-node.sh A\|B\|C` (pinned `lmcache/vllm-openai:v0.5.6`, LMCache MP mode, L1 = CPU DRAM, L2 = NVMe `fs_native`), `tierhit_smoke.py` (Spike A pass signal), `engine-info.sh`, `VERSIONS.md` | Syntax only. **Never run on a GPU.** |
| `bench/` | `driver.py` (N agent sessions, 4K shared prefix, 8K→32K private context over 8 turns, 256 out tokens, 5–30 s gaps, Poisson arrivals), `scrape.py` (vLLM + LMCache MP metrics), `report.py` (capacity points, N_C/N_B, N_B/N_A, u, M1/M6/M7), `correctness.py` (M5), `run.sh smoke\|full`, `prompts/correctness.json` | `bench/tests/test_harness.sh` passes against a fake node. |
| `gateway/` | Express + `@x402/core` resource server, Hedera exact scheme, **`paymentFlow: upfront`** (settles before vLLM runs; `PAYMENT-RESPONSE` sent before first token), integer micro-USD pricing (`src/pricing.ts`), caps before quoting (`src/caps.ts`), SQLite ledger via `node:sqlite` (`src/ledger.ts`), EIP-712 receipts (`src/receipt.ts`), HCS log (`src/hcs.ts`), Mode B tab path (`src/tab.ts`), on-chain baseline sync (`src/baselineSync.ts`). Scripts: `audit-prices`, `caps-test`, `replay-test`, `hcs-create-topic`, `hedera-check`, `associate-usdc`, `depth-query` | `pnpm test`: 14 tests pass with a fake facilitator and fake vLLM. `pnpm exec tsc --noEmit` clean. |
| `agent/` | Demo buyer: OpenAI SDK, `@x402/fetch` + `@x402/hedera`, budget cap via `X-Headroom-Max-Price`, slows at 80 %, stops at cap, JSONL log per turn with HashScan link | Ran locally against fakes: paid 2 turns then refused at cap. |
| `signer/` | `merkle.ts` (sorted-pair keccak, OZ-compatible), `post-batch.ts` (incl. `--tamper` for the dispute demo), `reconcile.ts` (S4 identity), `settle-demo.ts` (S2+S3 lifecycle), `set-baseline.ts` (operator relay of CRE output), `tab-client.ts` | Merkle test passes; everything on-chain untested (no escrow yet). |
| `contracts/` | `IHeadroomEscrow.sol`, `STUDIO-PROMPT.md` | Interface only; the contract does not exist yet. |
| `cre/` | CRE workflow `price-baseline` (TypeScript SDK 1.23.0): cron every 15 min, Vast.ai median with RunPod fallback, consensus median, `writeReport` to `arc-testnet`; `consumer/PriceBaselineReceiver.sol` reference; CLI v1.39.0 installed at `~/.local/bin/cre` | `cre workflow build` succeeded. `cre workflow simulate` stops at `cre login` (human, browser). |
| `dashboard/` | Next.js 16 on port 3100, every number inside `<a class="num" href>` to its evidence, `scripts/audit-links.mjs` (D2), fixtures for dev only | `pnpm build` clean, audit reports 0 unlinked with fixtures. |
| `scripts/` | `depth-check.sh` (section 8 runner, appends `docs/check-log.md`), `spike-b.sh`, `topup.sh` | Syntax only. |
| `docs/` | PRD, `HUMAN-TASKS.md`, `architecture.md` (mermaid), `ai-disclosure.md`, `check-log.md`, this file | |

Local machine quirks: `make` and `/usr/bin/python3` are broken on this Mac (Xcode licence not accepted). Run targets by hand (`cd gateway && pnpm -s audit-prices`, `bench/run.sh smoke`, etc.) or use `/opt/homebrew/bin/python3.12` and `uv run --with httpx`. On the GPU node (Linux) `make` works.

## 4. Where it stands right now

**Nothing has run on a real GPU, on Hedera, or on Arc.** Every gate is blocked on human-owned spikes:

| Spike | State | Blocker |
| --- | --- | --- |
| A GPU tier hits | not started | GPU not booked; HF token with Llama 3.1 licence not set |
| B Hedera settlement | **in progress** | see below |
| C Arc Studio deploy | not started | human must build the contract in Studio from `contracts/STUDIO-PROMPT.md` |
| D CRE simulation | built, not simulated | human must run `cre login` |

Spike B detail (as of 11:00 IST):
- Two ECDSA testnet accounts exist (created via a Hedera portal account under pravneet07singh@gmail.com; the portal password was set by a browser agent and **not saved anywhere**; use "Forgot password" if needed).
- `.env` exists (created from `.env.example`). Lines 30 and 51 are filled: `HEDERA_OPERATOR_ID=0.0.11334469` (receives), `AGENT_HEDERA_ID=0.0.11334561` (pays). **Lines 31 and 52 (`HEDERA_OPERATOR_KEY`, `AGENT_HEDERA_KEY`) are still empty**; the keys are on https://portal.hedera.com/dashboard ("HEX Encoded Private Key", `0x`-prefixed; account 2 under "Extra Accounts"). Only the human can paste them.
- Both accounts: 1000 HBAR, `max_automatic_token_associations = -1`, so `scripts/topup.sh` is unnecessary.
- The Circle faucet claim for the agent account reported "Tokens sent" but **0 USDC had arrived** on the mirror node. Re-check: `cd gateway && pnpm -s exec tsx scripts/hedera-check.ts`. If still 0 after ~15 min, request again at https://faucet.circle.com (Hedera Testnet, `0.0.11334561`); the faucet allows one request per 2 hours.
- Facilitators live-checked: Blocky402 `https://api.testnet.blocky402.com` lists `hedera:testnet` (feePayer `0.0.7162784`); x402.org `https://x402.org/facilitator` also lists it (feePayer `0.0.9185802`); Launa `https://testnet.facilitator.launa.dev` too (feePayer `0.0.9839454`). Whether Blocky402 settles **HTS USDC** (not just HBAR) is still unproven; the spike proves it.

Once keys are in `.env` and USDC has arrived:
```bash
scripts/spike-b.sh
```
It starts a fake vLLM (spike only), the real gateway against Blocky402, makes one real paid request, replays the same payment, prints the HashScan link. Pass: `replay-test: PASS` and an HTS USDC transfer on HashScan. Fallbacks: `X402_FACILITATOR_URL=https://testnet.facilitator.launa.dev`, then HBAR (`asset "0.0.0"`, label receipts) if no facilitator settles HTS USDC. Then put the HashScan link into README "Settled transactions" and run `cd gateway && pnpm hcs-create-topic` and set `HCS_TOPIC_ID`.

## 5. Verified partner facts (checked 2026-11-06; do not re-derive, do not invent)

- vLLM/LMCache: image `lmcache/vllm-openai:v0.5.6`; vLLM version inside is unpinned at build (expected 0.31.0; record `pip show vllm` into `infra/VERSIONS.md`). MP mode: `lmcache server --l1-size-gb N --eviction-policy LRU --l2-adapter '{"type":"fs_native","base_path":...}'` and `vllm serve … --kv-transfer-config '{"kv_connector":"LMCacheMPConnector","kv_role":"kv_both","kv_connector_module_path":"lmcache.integration.vllm.lmcache_mp_connector"}'`. Tier metrics on the server's `--http-port` 8080 `/metrics`: `lmcache_mp_lookup_hit_l1_total`, `lmcache_mp_lookup_hit_l2_total` (names may carry `_tokens`; `bench/common.py` tries candidates). In-process connector has no L1/L2 split. Open bug LMCache#6126: do not set `serde: fp8`. FP8 KV + MP offload is unverified until Spike A.
- Model: `meta-llama/Llama-3.1-8B-Instruct` (32 layers, 8 KV heads, head dim 128: 128 KiB/token BF16, 64 KiB FP8; gated, human accepts licence). Fallback Qwen3-8B needs YaRN above 32K.
- x402 v2 on Hedera: packages `@x402/core`, `@x402/hedera`, `@x402/fetch`, `@x402/express` all `2.30.0`; `@hiero-ledger/sdk` pinned `2.90.1` (never also install `@hashgraph/sdk`). Headers `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`. Requirements: `{scheme:"exact", network:"hedera:testnet", amount:"<atomic>", asset:"0.0.429274", payTo:"0.0.<op>", maxTimeoutSeconds:60, extra:{feePayer, paymentFlow:"upfront"}}`. Settle response `transaction` is `0.0.x@sec.nanos`; HashScan `https://hashscan.io/testnet/transaction/<id>`. USDC testnet `0.0.429274`, 6 decimals. HCS message count: `GET https://testnet.mirrornode.hedera.com/api/v1/topics/{id}/messages?order=desc&limit=1` → `sequence_number`.
- Arc testnet: chain id `5042002`, RPC `https://rpc.testnet.arc.io` (also `.arc.network`), explorer `https://explorer.testnet.arc.io`, gas is native USDC (18 dec), `maxFeePerGas ≥ 20 gwei` (signer uses 25), ERC-20 USDC `0x3600000000000000000000000000000000000000` (6 dec, same balance). viem has `arcTestnet`. EVM baseline Osaka. Faucet faucet.circle.com 20 USDC / 2 h. Arc Studio (studio.arc.io) deploys to Arc testnet; shareable-URL mechanism unverified; prize requires the app connected "without leaving Studio" (so build the escrow console page in Studio too).
- Chainlink CRE: `arc-testnet` is a supported write target, forwarder `0x76c9cf548b4179F8901cda1f8623568b58215E62`. `cre workflow simulate` uses a MockForwarder (never calls `onReport`); the prize says simulation is enough. Demo path for the baseline: simulate, then `cd signer && pnpm -s exec tsx src/set-baseline.ts --log <sim log>` relays the values on-chain and into `price_snapshot`; the gateway's `baselineSync` also reads `baseline("H200")` from the escrow every 60 s.
- GPU prices: Vast.ai keyless `GET https://console.vast.ai/api/v0/bundles/?q=<urlencoded JSON>` → `offers[].dph_total`; RunPod GraphQL fallback. Both wired in `cre/price-baseline/main.ts`.

## 6. Design decisions that are not in the PRD (PRD should be updated to match)

1. x402 v2 header and field names (above) replace the PRD's `X-PAYMENT`.
2. Payment flow is `upfront`: settle before the handler, stream after. The stock `@x402/express` middleware buffers responses, so `gateway/src/app.ts` drives `x402HTTPResourceServer.processHTTPRequest` directly.
3. CRE writes to Arc directly; the "mirror chain" fallback is dropped; the MockForwarder caveat is handled by the operator relay labelled with `cre_run_id`.
4. Escrow accounting identity for `make reconcile`: `deposited + penaltiesReceived == released + withdrawn + free + locked` per buyer (a successful challenge refunds the **whole batch** plus a fixed penalty from the operator bond).
5. Receipt leaf: `keccak256(abi.encode(requestId, buyer, promptTokens, cachedTokens, completionTokens, rIn, rCached, rOut, price, timestamp))`, EIP-712 domain `{name:"Headroom", version:"1", chainId, verifyingContract}` matching `STUDIO-PROMPT.md`. **Resolved 2026-11-06:** the gateway derives the domain from `ARC_CHAIN_ID` + `ARC_ESCROW_ADDRESS` (`receiptDomain()` in `gateway/src/receipt.ts`), publishes it in `/discovery.json`, and `settle-demo` refuses to spend gas unless the gateway domain and signer match the escrow (`receiptSigner()`), then checks the escrow's `receiptDigest` equals the local digest before challenging. Restart the gateway after setting `ARC_ESCROW_ADDRESS`; receipts signed before that cannot be challenged on-chain.
6. Pricing: integer rates in micro-USD per 1M tokens; quote `q = ceil((r_in·prompt + r_out·max_tokens)/1e6)`; Mode B charges usage price with the 0.25 cached discount. Gateway refuses to start without throughput for B and C: set `BOOTSTRAP_TOKENS_PER_HR_B/C` in `.env` until `bench/results/latest.json` exists.
7. Caps identify the buyer by the `X-Headroom-Buyer` header on the unpaid request (the paid retry uses the facilitator's `payer`). The demo agent sends it.
8. Bench timing: A ×1, B ×3, C ×3, 7 levels, ≈ 4.5 h; smoke B, C at N = 16, 48 ≈ 25 min. Warm-up 2 min per config excluded, 1 min settle + 4 min measured per level.
9. HCS messages are also sent for Mode B records (`m:"B"`); `depth-query` compares HCS count with `status='done'` count.

## 7. Next steps in order (critical path first)

1. **Spike B finish**: keys into `.env`, USDC arrival, `scripts/spike-b.sh`. Evidence → README, `docs/check-log.md`.
2. **Spike A**: book 1× H100 80 GB (≥ 256 GB host RAM, ≥ 1 TB NVMe, Docker + NVIDIA runtime), clone repo, fill `.env` (`HF_TOKEN`, `LMCACHE_L1_GB` ≈ 80 % of host RAM, `LMCACHE_L2_PATH` on NVMe, `GPU_USD_PER_HR`), run `infra/run-node.sh C && python3 infra/tierhit_smoke.py --fillers 80`, then `infra/engine-info.sh`. If the `lmcache` CLI is missing from the image, use `lmcache/standalone:<same tag>` for the server container. If FP8 + offload fails bit-exactness, report before changing configs.
3. `bench/run.sh smoke` → `bench/results/latest.json` (M1, M4, M5 evidence; also gives throughput for pricing). Then start `bench/run.sh full` (≈ 4.5 h) while payments are integrated; the GPU is busy during the full run.
4. Gateway on the node against real vLLM + Blocky402: `cd gateway && pnpm start`; `make demo` (20 unattended paid turns); `make caps-test`, `make replay-test`, `make audit-prices`; create the HCS topic. Post `/discovery.json` in the ETHGlobal Discord and at the Hedera booth as soon as 20 paid requests exist (V1 needs 5 external wallets).
5. **Spike C / Arc**: human builds `HeadroomEscrow` in Arc Studio from `contracts/STUDIO-PROMPT.md`, deploys, exports address + ABI into `contracts/`, sets `ARC_ESCROW_ADDRESS`, `ARC_STUDIO_PROJECT_URL`, `ARC_ESCROW_DEPLOY_BLOCK`, `ARC_OPERATOR_KEY`, `BUYER_ARC_KEY`, funds both with Arc USDC. Restart the gateway so receipts use the escrow domain (item 6.5). Then `make settle-demo` (≈ 12 min, spends testnet USDC) and `make reconcile`.
6. **Spike D**: `cd cre && cre login`, `cre workflow simulate price-baseline --target staging-settings`, save the log, relay with `set-baseline.ts`.
7. Dashboard on the node (`cd dashboard && pnpm build && pnpm start`), `node dashboard/scripts/audit-links.mjs`, `scripts/depth-check.sh` every 3 h (cron), README links, `docs/ai-disclosure.md` update with the new model name, video, submit by Sun 08:00 IST.

Cut order if behind (hours before deadline): H-30 no GPU → 48 GB fallback at 16K; H-18 full bench unfinished → use completed runs and state the count; H-14 no Studio contract → dispute path becomes a Studio test only; H-10 no CRE sim → manual snapshot labelled `source: manual`; H-1 → submit what passes, mark failures honestly.

## 8. Known gaps and risks

- Resolved 2026-11-06 by reading source (see `infra/VERSIONS.md`): `lmcache` is on PATH in the image and every `run-node.sh` flag exists at v0.5.6; vLLM `/tokenize` returns `count`; the M6 log lines match `infra/engine-info.sh`. Still re-check against the vLLM version inside the image after Spike A.
- Escrow must expose `receiptDigest(Record)` (in `IHeadroomEscrow.sol`); if Studio omits it, `settle-demo` skips the on-chain digest check but still runs the signer/domain pre-flight.
- Dashboard untested against a real ledger and real bench output.
- Circle faucet delay/failure on Hedera; one request per 2 h.
- Solo human time: Studio contract (≈ 3 h) is the longest human task; start it before H-18.

## 9. Session 2 update (2026-11-06 ~11:15 IST, Claude Opus 5.5)

State re-checked: every secret in `.env` is still empty (`HEDERA_OPERATOR_KEY`, `AGENT_HEDERA_KEY`, `RECEIPT_SIGNING_KEY`, `ARC_OPERATOR_KEY`, `BUYER_ARC_KEY`, `HF_TOKEN`). `hedera-check` shows both accounts at 1000 HBAR, **0 USDC, USDC not associated**: the Circle faucet claim never arrived. All four spikes remain human-blocked; section 7 order is unchanged.

Done this session: receipt domain alignment (item 6.5) plus settle-demo pre-flight; source checks closing three risks in section 8; PRD sections 7.5–7.7 and section 12 synced with the design decisions in section 6; AI disclosure names both models.

Later the same session (~11:45 IST): repo published at https://github.com/parry22/headroom, local branch renamed `master` → `main` and pushed; history scanned for secrets first (only public Anvil test keys #1 and #5 appear, in tests and the dashboard fixture). `signer/src/gen-keys.ts` filled `RECEIPT_SIGNING_KEY`, `ARC_OPERATOR_KEY`, `BUYER_ARC_KEY`; operator and buyer each got 20 Arc testnet USDC from faucet.circle.com (txs `0x00fa87f3…ef837`, `0x91a470b6…cd5bf` on testnet.arcscan.app). Arc Studio can be driven from the terminal with the official `@circle-fin/arc-studio-cli` (`arc-studio run ... --output json`, `arc-studio pull`); install was blocked by the agent's permission classifier, so the human installs it and runs `arc-studio login`. Current human list: top of `docs/HUMAN-TASKS.md`.

~11:55 IST: **Spike B passed.** Keys in `.env` (human supplied `RECEIPT_SIGNING_KEY` too, so the receipt signer is `0x9ED0B08Cf7D36061cA487b540174C75B6BC619d6`; STUDIO-PROMPT updated). Blocky402 settles HTS USDC on Hedera testnet: 6 settlements, links in README. HCS topic `0.0.11335247` created and in `.env`. Fixed along the way: HCS messages queued in memory were lost on restart (now `HcsLog.backfill()` at startup, drain on SIGTERM, `/health` reports `hcs_unsent`), and `spike-b.sh` left gateways running because the pnpm wrapper does not forward signals (now runs `tsx` directly, refuses busy ports, stops children). Run long-lived services as `node_modules/.bin/tsx`, never backgrounded `pnpm exec`.

## 10. Session 2, fix pass (2026-11-06 14:15–14:40 IST, Claude Opus 5.5)

All on testnet; inference is still the local fake vLLM because no GPU is booked.

- **Reference escrow.** `contracts/reference/HeadroomEscrow.sol` implements `IHeadroomEscrow` from STUDIO-PROMPT; 12 Foundry tests pass offline (`make escrow-test`, solc 0.8.28, no forge-std). Deployed with `signer/src/deploy-reference.ts` to `0xfa7b11252defd7ce61d271f2cbfc8eab7a5acb6f` (block 71002512), constructor values from STUDIO-PROMPT. `ARC_ESCROW_ADDRESS`/`ARC_ESCROW_DEPLOY_BLOCK` in `.env` point at it. This is a rehearsal, not the Studio submission (S1 open).
- **S2/S3/S4/S5 pass on Arc.** `settle-demo`: bond, deposit, session key, 20 tab requests, wrong batch challenged and refunded with penalty, clean batch released after 600 s. On-chain `receiptDigest` equals the gateway's. `reconcile`: PASS. `postBatch` above baseline reverts `AboveBaseline()` (simulated call). Links in README.
- **P2/P3/P6 pass on the production ledger.** Fresh HCS topic `0.0.11336690` (spike records stay on `0.0.11335247`). Demo agent: 50 paid HTS USDC requests unattended (run 2 stopped at turn 31 on `context_too_long`, the context cap working as designed); `audit-prices` 50/0 mismatches; 70 done records (50 Hedera + 20 tab) = 70 HCS messages.
- **D1** fresh via a manual relay of live Vast.ai medians (`source: manual-relay`); stale again after `BASELINE_STALE_SECONDS`. CRE still needs `cre login`.
- **D2** `audit-links: 0 unlinked` against the built dashboard with the real ledger; bench sections show "no data yet".
- **Bugs fixed.** `settle-demo` crashed because `.env` ships `SESSION_KEY=` empty and `??` kept the empty string (now `||`). `post-batch` raised `baselineAmount` to `amount` for every batch, which would hide the S5 cap; now only the deliberately wrong demo batch does that.
- **Config.** `TEAM_WALLETS` = agent, operator and Arc buyer, so V1/V2 now report 0 external, correctly.

Still human-blocked: GPU + `HF_TOKEN` (G1, M1–M7, real-inference P4), `cre login` (CRE run), external users (V1, V2, V3).

~14:45 IST: the Arc judges confirmed any CLI deploy to Arc counts; Arc Studio is not required. The escrow moved to `contracts/src/HeadroomEscrow.sol` and is the submission contract (S1 passes); `STUDIO-PROMPT.md` is now `contracts/ESCROW-SPEC.md`, `deploy-reference.ts` is `deploy-escrow.ts`. Sections 1–8 above still describe the Studio plan; this note supersedes them.

~17:45 IST: `cre login` done by the human. `cre workflow simulate price-baseline` passes after one fix: zod `z.string().url()` fails inside the CRE WASM runtime (no `URL` global), replaced by a regex. `consumerAddress` now points at the escrow. Consensus H100 3405333 e6, H200 3995556 e6; relayed with `signer/src/set-baseline.ts --log` as `cre-sim:22926f0036f6f2c9` (on-chain `baseline("H200")` = 3995556 @ 1793967300). Account has no deploy access, so a live DON run is out of scope. The baseline goes stale after `BASELINE_STALE_SECONDS`: re-run simulate + relay before each demo.


~19:10 IST: **Plan A, tracks narrowed to Hedera + Chainlink.** CRE does not list Hedera as a supported network (Arc Testnet is listed), so Arc stays as the CRE write target and tab settlement chain but is not pitched. Added: each relayed baseline is also published to its own HCS topic `0.0.11339845` (`HCS_BASELINE_TOPIC_ID`, `publishBaseline` in `gateway/src/hcs.ts`, called by `signer/src/set-baseline.ts`); kept off the paid-request topic so P6 stays exact. Fresh CRE run `cre-sim:ca88c9703a4b6e88` relayed to Arc and HCS (messages 1, 2). PRD section 9 and the demo script, README and dashboard order now lead with Hedera, then Chainlink, then Arc.

~19:40 IST: **Cheapest node.** Switched to an RTX 4090 24 GB (Vast.ai, about $0.35/h, CUDA ≥ 13.0 driver needed for the CUDA 13.0 image) and the ungated `RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8` (same architecture, so M6 math is unchanged; no HF token). `MAX_MODEL_LEN` 40960 (bench prompts reach ~36.5K), LMCache L1 40 GB, L2 120 GB at `/root/lmcache-l2`. Bench levels 2..32 (full ~2.7 h, smoke N=4,16 ~20 min). `infra/run-node.sh`, `stop-node.sh` and `engine-info.sh` run vLLM and LMCache as plain processes when the host has no Docker (Vast instances are containers); logs and pids in `infra/logs/`. Not yet run on hardware.

