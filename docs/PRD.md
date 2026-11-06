# Headroom PRD: Long-Context Inference on Cheap Memory, Sold Per Token to Agents

Nov 6, 2026 · @Pravneet Singh

## 1. Summary and thesis

Headroom sells long-context inference to AI agents at H100-class cost by keeping only hot KV cache in GPU memory and parking the rest in CPU DRAM and NVMe. Agents pay per request over x402 on Hedera, or run a tab that settles in USDC on Arc through a savings-share escrow.

**The problem.** Memory, not compute, is what prices GPUs in 2026.

- H200 rental prices rose about 160% this year versus about 35% for H100 (Ornn Data, reported by a16z, Oct 2026). The main difference is memory: 141 GB of HBM versus 80 GB.
- Surging KV cache demand plus constrained memory supply caused severe memory bottlenecks in H1 2026 ([TrendForce](https://www.trendforce.com/research/download/RP260715HU)).
- At long context, a model's KV cache can take more memory than its weights ([GPU Mart](https://rdp.in/gpu-mart/?p=2853)). Agents are the workload that grows context every turn.
- Gartner expects inference cost per agent workflow to rise more than fivefold through 2028 ([Computerworld](https://www.computerworld.com/article/4210786/ai-inference-is-getting-cheaper-but-your-agents-are-getting-more-expensive.html)).

**Why the gap is open.** The engine layer is free and already adopted: LMCache works with vLLM, SGLang and Nvidia Dynamo, and Google Cloud runs it in GKE Inference ([Spheron](https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/)). What nobody sells is the outcome, delivered straight to agents and priced against the H200 they would otherwise need.

**Thesis.**

1. Agents are idle most of their wall-clock time: they wait on tool calls between turns. Their KV cache does not need to sit in HBM while they wait. Park it in DRAM, reload it on the next turn, and one GPU carries far more live sessions.
2. Agents tolerate the reload latency; chat users do not. Sell to agents first.
3. Price against the H200-equivalent cost and keep a share of the gap. Buyers pay less than baseline, and the operator earns a memory premium on cheaper hardware.

**What ships at ETHGlobal Mumbai.** One GPU node with an OpenAI-compatible endpoint, x402 pay-per-request on Hedera testnet, a savings-share escrow on Arc testnet, a Chainlink CRE price baseline, and a public dashboard that proves the memory claim with live, reproducible numbers.

## 2. Users and jobs to be done

Two P0 customers: the agent that buys tokens and the human who builds and funds it. Hackathon teams on the Hedera x402 track are the first channel, because their qualification requires an agent that pays a real endpoint.

| Persona | Situation | Job to be done | Success they feel | Priority |
| --- | --- | --- | --- | --- |
| Buyer agent (machine customer) | Coding, research or eval agent; 32K+ token context; waits on tool calls between turns; no human watching | Buy long-context tokens at the lowest price that still finishes the task, inside a hard budget | Task done under budget, a receipt per call | P0 |
| Agent builder (human) | Inference bill scales with context length; already on the OpenAI SDK | Swap the base URL, cap spend per agent, audit what was bought | Lower cost per completed task, no rewrite | P0 |
| Hedera x402 hackathon team | Needs a paid service its agent can call end to end | Get a working x402 endpoint to pay inside their own demo | Their track qualification passes | P0 (channel) |
| GPU operator (post-hackathon) | Owns 80 GB or smaller GPUs that rent below H200 rates | Sell long-context work on those GPUs at closer to H200 value | Higher revenue per GPU-hour | P2 |

**Job statements.**

- **Buyer agent:** When my next turn needs 32K+ tokens of context and nobody is waiting on me, I want to buy those tokens at the lowest available price with a hard cap, so I can finish the task without a human topping me up.
- **Agent builder:** When my agents' inference bill grows with every turn of context, I want a drop-in endpoint that is cheaper for long context and gives me per-call receipts, so I can cut cost without rewriting my agent or trusting an opaque bill.
- **Operator (later):** When my 80 GB GPUs rent at a discount to H200, I want to sell work that only H200s could otherwise hold, so I can capture the memory premium.

**Why they hire Headroom.** Price per 1M tokens below the H200-equivalent, an OpenAI-compatible API, enforced spend caps, and a verifiable receipt for every call.

**Why they fire it.** Turn latency too slow for their loop, a failed or double-charged payment, or a price they cannot reproduce from the published formula.

## 3. Goals, non-goals and success metrics

Headroom passes the hackathon if it proves three things with live numbers: at least 2x agent sessions per GPU, a money loop that runs with no human, and at least 5 external teams paying.

**Goals.**

1. **G1, memory claim:** on one GPU, sustain at least 2x the concurrent agent sessions of a tuned baseline at the same latency target.
2. **G2, money loop:** agents pay per request on Hedera with no human approval, and a builder's tab settles on Arc through deposit, batch, dispute window and release.
3. **G3, demand:** at least 5 external teams or wallets pay for real requests during the event.

**Non-goals for this build.** Training or fine-tuning. A new KV cache engine or custom kernels. Multi-GPU or disaggregated prefill and decode. Real-time chat latency. Production SLAs, mainnet funds or proprietary models. A GPU marketplace.

**North star.** Long-context tokens served to paying external agents. It only moves when the memory trick, the payment loop and demand all work at once.

| Metric | Definition | Hackathon bar | 30-day bar | Measured by |
| --- | --- | --- | --- | --- |
| Session capacity gain | Max concurrent agent sessions meeting the TTFT target, Headroom ÷ baseline B on the same GPU and model | ≥ 2.0x | ≥ 3.0x | Benchmark harness |
| Offload share of gain | Gain from config B to C only (offload on top of FP8 KV) | ≥ 1.5x | ≥ 2.0x | Benchmark harness |
| TTFT p95 at 32K context | Time to first token at the capacity point, cache hit / cache miss | ≤ 1.5 s / ≤ 6 s | ≤ 1.0 s / ≤ 5 s | Benchmark harness |
| KV reuse rate | Prompt tokens served from cache ÷ all prompt tokens, replay workload | ≥ 50% | ≥ 70% | vLLM and LMCache metrics |
| Cost per 1M tokens | Node $/hr ÷ tokens/hr at the capacity point, vs H200-equivalent | ≤ 60% of baseline | ≤ 50% | Meter + CRE price feed |
| Paid requests | Requests settled on Hedera or billed to an Arc tab | ≥ 200 | ≥ 50,000 | Meter, HashScan |
| Tokens served to external agents | Sum of prompt + completion tokens, excluding the team's own demo agent | ≥ 2M | ≥ 500M | Meter |
| Paying external teams | Distinct wallets not controlled by the team | ≥ 5 | 3 weekly design partners | Meter |
| Settlement accuracy | Released + refunded + remaining = deposited, per buyer | Exact | Exact | Arc events vs ledger |
| Willingness to pay | Teams saying they would pay at ≤ 60% of H200-equivalent price | ≥ 3 | ≥ 3 signed pilots | Interviews |

The latency and capacity bars are first targets. After the first benchmark run, tighten them if they pass easily, but never loosen a bar without writing down why.

## 4. Product scope and feature specs

The P0 set is the smallest product that proves G1 to G3. Everything else waits until a P0 gate passes.

**Two ways to pay, one meter.**

- **Mode A, pay as you go (Hedera x402).** For agents with a wallet and no account. Each request is quoted, paid and settled before the GPU sees a token.
- **Mode B, tab (Arc escrow).** For builders running a fleet. They deposit USDC once, agents sign requests with a session key, and usage settles in batches after a dispute window. It suits high-frequency calls where per-request settlement adds overhead.

| ID | Feature | What it does | Acceptance criteria | Serves |
| --- | --- | --- | --- | --- |
| F1 | Inference node | vLLM with LMCache: hot KV in HBM, warm KV in CPU DRAM, cold KV and shared prefixes on NVMe; OpenAI-compatible API | /v1/chat/completions streams; KV tier hits nonzero in a replay run; greedy outputs identical with offload on vs off | G1 |
| F2 | Benchmark harness | Replays synthetic agent sessions with tool-call gaps across three configs | One command produces a CSV and a capacity curve; median of 3 runs | G1 |
| F3 | Meter and ledger | Records tokens, cached tokens, KV bytes, tier hits, latency, actual cost and H200-equivalent cost per request | Every request has a record; price recomputes from the record exactly | G1, G2 |
| F4 | x402 gateway | Quotes per request, returns 402 with payment requirements, verifies and settles through a Hedera facilitator, then forwards | 20 unattended paid requests settle on Hedera testnet with HashScan links | G2, Hedera |
| F5 | Spend controls | Per-wallet daily cap, per-request max price header, allowlist | Over-cap requests are refused before the GPU is called (3 negative tests) | G2, Hedera |
| F6 | HCS audit log | One compact message per paid request on a Hedera Consensus Service topic | HCS message count equals paid request count | G2, Hedera |
| F7 | Arc savings-share escrow | Deposit, batch post, dispute window, challenge with Merkle proof, release, refund, withdraw | Full lifecycle on Arc testnet, including one successful challenge | G2, Arc |
| F8 | Batch signer | Builds a Merkle root over a buyer's records and posts it to Arc every N requests or T minutes | Any record can be proven against its posted root | G2, Arc |
| F9 | Public dashboard | Capacity curve, cost per 1M vs baseline, tier hits, paid requests, live receipts with explorer links | Every number links to a CSV row or a transaction | G1 to G3 |
| F10 | Demo buyer agent | A budget-aware long-context agent that pays on its own and slows down when funds run low | Runs 20 turns with no human; degrades gracefully at the cap | G2, Hedera |
| F11 | CRE price baseline (P1) | Chainlink CRE workflow pulls H100 and H200 rental prices from an external API and sets the baseline | CRE CLI simulation succeeds; pricing uses a timestamped value | Chainlink |
| F12 | Credit-back ledger (P1) | Refunds unused max\_tokens headroom as wallet credit for the next request | Overpay per request bounded and returned | G2 |
| F13 | Discovery manifest (P1) | Public JSON listing endpoints, prices, network and asset for agents to find | Another team's agent finds and pays the endpoint unaided | G3 |
| F14 | Operator onboarding (P2) | Third parties run a Headroom node and earn the operator share | Out of scope for Mumbai | Later |
| F15 | Deadline tiers (P2) | Lower prices for looser deadlines, run on idle capacity | Out of scope for Mumbai | Later |

**Cut order if behind.** Drop F13, then F12, then F11. Then move the F7 dispute path to a scripted test. Never cut F1, F2, F4 or F9: they carry the memory proof and the main prize.

## 5. System architecture

One GPU node runs everything Headroom owns; Hedera, Arc and Chainlink are the only outside dependencies.

&#91;embedded content: Headroom architecture · one GPU node, three partner networks\]

A request runs left to right along the top row and is paid on Hedera before the engine starts. Usage flows down from the engine to the meter, the batch signer and the Arc escrow.

| Component | Built with | Runs on |
| --- | --- | --- |
| x402 gateway and meter | TypeScript, x402 middleware, SQLite ledger | GPU node, CPU side |
| Inference engine | vLLM + LMCache in one pinned Docker image | GPU node |
| Batch signer | TypeScript, Merkle tree library, viem | GPU node |
| Dashboard | Next.js reading the ledger and bench CSVs | GPU node or static host |
| Arc escrow | Solidity, built and tested with Foundry, deployed to Arc from the CLI | Arc testnet |
| Price baseline | Chainlink CRE workflow | CRE CLI simulation |
| Audit log | Hedera Consensus Service topic | Hedera testnet |

## 6. Core flows

Payment always settles before the GPU runs, and money on Arc moves only after a dispute window closes.

### 6.1 Paid request (Mode A)

&#91;embedded content: Paid request, Mode A · 12 steps\]

Steps 7 to 9 happen inside the node and add no payment latency. Step 11 is asynchronous, so the agent never waits on the audit log.

### 6.2 Tab settlement on Arc (Mode B)

&#91;embedded content: Arc tab lifecycle · 8 states, 1 decision\]

Any record can be challenged by proving it against the posted root. A successful challenge refunds the overcharge plus a penalty from the operator bond.

### 6.3 Baseline price update

1. The CRE cron fires every 15 minutes.
2. The workflow fetches H100 and H200 rental prices from the external source.
3. It takes the median $/hr per GPU type and writes setBaseline.
4. The gateway picks up the new value; /pricing and new receipts show its timestamp.
5. With no update for 1 hour, receipts flag the baseline as stale.

### 6.4 Benchmark run

1. `make bench` runs configs A, B and C in turn on the same GPU, model and seed.
2. The replay driver steps N through the sweep: 1 minute of warm-up, then 4 minutes measured per level.
3. The harness scrapes metrics and writes one CSV row per turn.
4. It computes each config's capacity point, the gain ratios and measured u.
5. It runs the 20-prompt correctness check and publishes the report to /bench/latest.

The full run (3 configs, 7 levels, 3 runs) takes about 4 hours, so run it once overnight. `make bench-smoke` (configs B and C, N = 16 and 48, one run) takes about 20 minutes and is what the depth-check agent runs.

### 6.5 Another team's agent onboards

1. Their agent reads `/discovery.json`.
2. It calls `/v1/chat/completions` and receives a 402 with payment requirements.
3. Its x402 client pays from its wallet and gets the response plus a signed receipt.
4. Optionally, the builder sets caps with `PUT /v1/budget`.

## 7. Technical specs

The gain comes from one fact: an agent's KV cache only needs HBM while the agent is generating, and agents spend most of their time waiting on tools.

### 7.1 Memory math

```latex
\text{KV bytes per token} = 2 \cdot L \cdot H_{kv} \cdot d_{head} \cdot b
```

L = layers, H\_kv = KV heads, d\_head = head dimension, b = bytes per value. For an 8B-class GQA model such as Llama 3.1 8B (32 layers, 8 KV heads, head dim 128):

| KV precision | Per token | Per 32K-token session | Sessions resident on an 80 GB GPU |
| --- | --- | --- | --- |
| BF16 (b = 2) | 128 KiB | 4 GiB | about 13 |
| FP8 (b = 1) | 64 KiB | 2 GiB | about 26 |

Resident estimate assumes 90% of HBM usable and about 16 GB of BF16 weights. A 256 GB host can park roughly 100 more FP8 sessions in DRAM. Reloading a 2 GiB session over PCIe Gen4 x16 (about 25 GB/s in practice) takes roughly 0.1 s, well inside the TTFT target.

```latex
N_{max} \approx \min\left(\frac{S_{hbm}}{u},\; S_{hbm} + S_{dram}\right)
```

S\_hbm = sessions resident in HBM, S\_dram = sessions parked in DRAM, u = share of wall-clock time an agent is generating. At u = 0.3 the theoretical ceiling is about 3.3x; the 2x bar leaves room for reload contention and scheduling losses. The harness must report measured u so the gain can be explained, not just shown.

### 7.2 Inference node

- **Hardware:** one GPU with 48 to 80 GB (H100 80 GB preferred, L40S 48 GB fallback), host RAM ≥ 256 GB, local NVMe ≥ 1 TB, PCIe Gen4 x16 or better.
- **Software:** vLLM and LMCache at pinned versions in one Docker image, using LMCache's vLLM connector. Model: an open-weight 8B-class instruct model with 128K context and a license that allows hosted serving.
- **Config:** prefix caching on; FP8 KV cache (`--kv-cache-dtype fp8`); max context 64K; LMCache CPU tier sized to about 80% of host RAM; NVMe tier for cold sessions and shared prefixes; chunk size starts at 256 tokens and is tuned by the harness.
- **Isolation:** cache keys salted per buyer, except published public prefixes such as Headroom's own tool schemas (see 7.10).
- **Telemetry:** Prometheus metrics from vLLM and LMCache, scraped by the harness and the meter.

### 7.3 Benchmark harness

| Config | KV precision | Prefix caching | Offload | Purpose |
| --- | --- | --- | --- | --- |
| A | BF16 | On | None | Naive baseline |
| B | FP8 | On | None | Tuned baseline, the bar's denominator |
| C | FP8 | On | LMCache DRAM + NVMe | Headroom |

- **Workload:** N agent sessions. Each has a shared 4K-token tool prefix plus private context growing from 8K to 32K tokens over 8 turns, 256 output tokens per turn, and a tool-call gap of 5 to 30 s between turns. Sessions arrive as a Poisson process.
- **Sweep:** N ∈ {4, 8, 16, 32, 48, 64, 96}.
- **Per turn, record:** TTFT, decode tokens/s, prompt tokens, cached tokens by tier, preemptions, GPU KV usage, and the session's generating share u.
- **Capacity point:** the largest N with TTFT p95 under target and zero errors. Gain = N\_C ÷ N\_B, with N\_B ÷ N\_A reported separately.
- **Rules:** same GPU, model and seed for all configs; the first 2 minutes are warm-up and excluded; 3 runs each, median reported; raw CSV committed to the repo.
- **Correctness:** 20 fixed prompts at temperature 0. C's outputs must match B's exactly, since offload copies KV and must not alter it.

### 7.4 Pricing model

```latex
p = c_a + k\,(c_b - c_a), \qquad c_a(1+m) \le p \le c_b
```

| Symbol | Meaning | Launch value |
| --- | --- | --- |
| c\_b | H200-equivalent cost per 1M tokens: H200 $/hr ÷ H200 tokens/hr on the same workload | From CRE feed and a measured or modelled H200 run |
| c\_a | Headroom cost per 1M tokens: node GPU $/hr plus host RAM and NVMe $/hr, ÷ tokens/hr at config C's capacity point | From CRE feed and harness |
| k | Operator share of the gap | 0.30 |
| m | Minimum margin over cost | 0.10 |

Buyer savings per 1M tokens = (1 − k)(c\_b − c\_a). If no H200 run is possible, c\_b is modelled from config B scaled by HBM available for KV, and the receipt labels it modelled.

**Per-token rates.** p splits into three published rates with fixed weights, calibrated so the replay workload averages to p: uncached input (weight 1), cached input (0.25) and output (4). Mode A quotes conservatively: q = r\_in × prompt\_tokens + r\_out × max\_tokens, treating all input as uncached. The P1 credit-back returns the difference after the request.

### 7.5 x402 gateway

1. Tokenize the prompt, check the caps, compute q. Caps identify the buyer by the `X-Headroom-Buyer` header on the unpaid request; the paid retry uses the facilitator's `payer`.
2. No payment header: return 402 with payment requirements (network Hedera testnet, asset USDC on HTS, pay-to operator account, amount q, resource, 60 s expiry).
3. Retry with `PAYMENT-SIGNATURE` (x402 v2; v1 called it `X-PAYMENT`): verify and settle through a facilitator listed in the [Hedera x402 docs](https://docs.hedera.com/solutions/ai/x402/facilitators); store the transaction ID. The flow is `upfront`: settlement completes before the handler runs, and `PAYMENT-RESPONSE` is sent before the first streamed token.
4. Forward to vLLM and stream the response.
5. Finalize the meter record; return a signed `X-Headroom-Receipt` (also the final SSE event `headroom_receipt`).
6. Queue the HCS audit message.

**Guards.** Caps checked before quoting, so the GPU is never called for a request that will be refused. Seen-payment set for replay protection. Idempotency keys on retries. Per-wallet rate limits. **Mode B** requests carry an EIP-712 signature from a session key registered on the Arc escrow; the gateway checks free balance ≥ outstanding usage + q.

### 7.6 Arc escrow contract

| Function | Caller | Effect | Checks |
| --- | --- | --- | --- |
| deposit(amount) | Buyer | Pulls USDC into the buyer's balance | amount > 0 |
| registerSessionKey(key, expiry) | Buyer | Authorizes an agent key for the tab | expiry ≤ 7 days |
| postBatch(buyer, root, count, tokens, amount, baselineAmount) | Operator | Opens a batch and locks amount | amount ≤ baselineAmount; amount ≤ free balance; operator bond posted |
| challenge(batchId, leaf, proof, receipt) | Buyer | Proves one record is in the root and mispriced | Inside the window; valid Merkle proof; leaf differs from the signed receipt or breaks the price formula |
| release(batchId) | Anyone | Pays the operator | Window closed; no successful challenge |
| withdraw(amount) | Buyer | Returns unused funds | Amount not locked by an open batch |
| setBaseline(gpuType, usdPerHourE6, timestamp) | CRE forwarder or operator | Stores the price baseline | Newer timestamp than the stored value |

- **Leaf:** keccak256 over requestId, buyer, prompt, cached and completion tokens, unit prices, price and timestamp. The receipt is the gateway's EIP-712 signature over the same fields.
- **Receipt domain:** EIP-712 `{name: "Headroom", version: "1", chainId, verifyingContract: escrow}`. The gateway signs under this domain whenever `ARC_ESCROW_ADDRESS` is set and publishes it in `/discovery.json`.
- **Successful challenge:** refunds the whole batch plus a fixed penalty from the operator bond. The per-buyer accounting identity checked by `make reconcile` (S4) is therefore `deposited + penaltiesReceived = released + withdrawn + free + locked`.
- **Window:** 10 minutes on testnet for the demo, 24 hours in production.
- **Units:** USDC with 6 decimals throughout. Events: Deposited, BatchPosted, Challenged, Released, Refunded, Withdrawn, BaselineSet.

### 7.7 CRE price baseline

- **Trigger:** cron every 15 minutes, run as a CRE CLI simulation for the demo.
- **Steps:** HTTP fetch of H100 and H200 rental prices (Vast.ai bundles API, RunPod as fallback); consensus median $/hr per GPU type; `writeReport` to `arc-testnet`, which CRE supports as a write target.
- **Simulation caveat:** `cre workflow simulate` writes through a MockForwarder that never calls `onReport`, so for the demo the operator relays the simulated values to `setBaseline` and labels the snapshot with the `cre_run_id`. The relay also publishes each value to the HCS baseline topic (`signer/src/set-baseline.ts`). The gateway also reads `baseline("H200")` from the escrow every 60 s.
- **Fallback:** keep the last value; after 1 hour, receipts flag it as stale.

### 7.8 Data model

| Entity | Key fields | Written by | Read by |
| --- | --- | --- | --- |
| usage\_record | request\_id, mode, buyer, model, prompt\_tokens, cached\_tokens\_by\_tier, completion\_tokens, kv\_bytes\_peak, ttft\_ms, latency\_ms, gpu\_seconds, unit\_prices, price, actual\_cost, baseline\_cost, payment\_tx, hcs\_seq, batch\_id, created\_at | Gateway | Signer, dashboard, buyer API |
| batch | batch\_id, buyer, merkle\_root, record\_count, tokens, amount, baseline\_amount, post\_tx, window\_ends, status | Signer | Dashboard, contract mirror |
| price\_snapshot | ts, gpu\_type, usd\_per\_hr, source, cre\_run\_id, stale | CRE workflow | Pricing, receipts |
| budget | buyer, daily\_cap, max\_price\_per\_request, allowlist, session\_keys | Buyer API | Gateway |
| bench\_run | run\_id, config, n\_sessions, ttft\_p50, ttft\_p95, tokens\_per\_s, hit\_rate\_by\_tier, u, errors, csv\_path | Harness | Dashboard |

### 7.9 API surface

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| /v1/chat/completions | POST | x402 payment or tab signature | OpenAI-compatible inference |
| /v1/models | GET | None | Served models and max context |
| /pricing | GET | None | Current rates, c\_a, c\_b, k, baseline timestamp |
| /discovery.json | GET | None | Endpoints, prices, network, asset, receipt public key |
| /v1/usage | GET | Wallet signature | A buyer's records and receipts |
| /v1/budget | PUT | Wallet signature | Set caps, allowlist and session keys |
| /bench/latest | GET | None | Latest capacity curve and raw CSV link |
| /health | GET | None | Liveness for the dashboard |

### 7.10 Security, isolation and abuse

- **Cross-tenant leakage:** a shared prefix cache leaks through timing, because a cache hit answers faster. Salt cache keys per buyer and share only published public prefixes.
- **Data at rest:** KV on DRAM and NVMe is prompt data. Encrypt the NVMe tier, evict after 24 hours, and log prompt hashes, never prompts.
- **Keys:** operator Hedera and Arc keys live in a secret store, never in the repo. The receipt signing key's public half is in the discovery manifest.
- **Abuse:** per-wallet rate limits, a max context cap, a max\_tokens cap, and no streaming before settlement.

### 7.11 Non-functional

- **Availability:** best effort for the event, with a health check and auto-restart.
- **Reproducibility:** `make bench`, `make demo` and `make settle-demo` run from the README on a fresh machine.
- **Observability:** structured logs plus the metrics the dashboard reads; no third-party analytics.

## 8. Technical depth bar

Headroom only counts as technically deep if every Blocker below passes on evidence produced in the same run. An agent re-checks the bar on a schedule and sets each Status from fresh evidence, never from memory or a commit message.

| ID | Check | Pass bar | Evidence | When | Severity | Status |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Offload is real | DRAM and NVMe tier hits both above 0 in the replay run; GPU KV usage plateaus while sessions grow | Bench CSV tier-hit columns, metrics snapshot | Every bench run | Blocker | Not checked |
| M2 | Capacity gain | N\_C ÷ N\_B ≥ 2.0x at the TTFT target, median of 3 runs | /bench/latest curve and CSV | Every bench run | Blocker | Not checked |
| M3 | Gain attribution | N\_B ÷ N\_A and N\_C ÷ N\_B both reported; offload share ≥ 1.5x | Bench report | Every bench run | Major | Not checked |
| M4 | Latency target | TTFT p95 ≤ 1.5 s on cache hit and ≤ 6 s on miss at 32K, at the capacity point | Bench CSV | Every bench run | Blocker | Not checked |
| M5 | Bit-exact reload | 20 greedy prompts: config C output equals config B output exactly | make correctness returns an empty diff | Every engine or config change | Blocker | Not checked |
| M6 | Memory math holds | Measured KV bytes per token within 10% of 2·L·H\_kv·d\_head·b | Bench log line | First run and on model change | Major | Not checked |
| M7 | Duty cycle explains gain | Measured u per session reported and consistent with the N\_max formula | Bench report | Every bench run | Major | Not checked |
| P1 | Real settlement | At least one request settled on Hedera testnet via a listed facilitator; no mocked facilitator anywhere | HashScan link in README | Every 3 hours | Blocker | Not checked |
| P2 | No human in the loop | Demo agent completes 20 paid requests unattended | Agent log and 20 transaction IDs | Every 3 hours | Blocker | Not checked |
| P3 | Quote correctness | Charged amount equals the formula from token counts, to 1 micro-USDC, on 50 sampled records | make audit-prices | Every 3 hours | Blocker | Not checked |
| P4 | Caps refuse before GPU | 3 over-cap requests refused and the vLLM request counter does not move | Test output and metrics diff | Every gateway change | Blocker | Not checked |
| P5 | Replay protection | A reused payment payload is rejected | Test output | Every gateway change | Major | Not checked |
| P6 | Audit completeness | HCS message count equals paid request count | Mirror node query vs ledger count | Every 3 hours | Major | Not checked |
| S1 | Built and deployed for Arc | Contract tested (`make escrow-test`) and deployed to Arc testnet from the CLI; source in the repo (Arc judges: CLI deploy qualifies, Studio not required) | Deploy tx link + test output | Once, then before submit | Blocker | Not checked |
| S2 | Full lifecycle | Deposit, batch post, window close and release on Arc testnet | 4 transaction links | Every contract change | Blocker | Not checked |
| S3 | Dispute path | A deliberately wrong batch is challenged with a Merkle proof and the buyer is refunded | Challenged and Refunded transaction links | Every contract change | Major | Not checked |
| S4 | Reconciliation | deposited + penaltiesReceived = released + withdrawn + free + locked, per buyer, exactly (refunds return to free) | make reconcile returns 0 | Every 3 hours | Blocker | Not checked |
| S5 | Baseline cap | postBatch above baselineAmount reverts | Contract test | Every contract change | Major | Not checked |
| D1 | Fresh baseline | Pricing uses a baseline under 1 hour old, or the receipt says stale | /pricing response | Every 3 hours | Major | Not checked |
| D2 | No hard-coded numbers | Every dashboard number links to a CSV row or a transaction | Click-through audit | Before each demo | Blocker | Not checked |
| V1 | External payers | At least 5 distinct wallets not controlled by the team have paid | Ledger query excluding team wallets | Every 3 hours from block 2 | Blocker | Not checked |
| V2 | Volume | At least 200 paid requests and 2M external tokens | Ledger query | Every 3 hours | Major | Not checked |
| V3 | Willingness to pay | At least 3 teams answered the price question | Interview notes | Before submit | Major | Not checked |
| E1 | Fresh start | All project code written after the hackathon start; only public libraries and starter kits predate it | First commit time, dependency list | Once, then before submit | Blocker | Not checked |
| E2 | Steady history | Commits spread across the window, no single drop on the last day | git log by hour | Every 3 hours | Major | Not checked |
| E3 | Reproducible | make bench and make demo run from the README on a fresh machine | Clean-machine run log | Before submit | Major | Not checked |
| E4 | AI disclosure | README states how AI tools were used and what the team built | README section | Before submit | Major | Not checked |

**Automatic fail, whatever the table says.**

- A mocked facilitator or simulated payment anywhere in the demo path.
- Benchmark configs that differ in GPU, model, seed or workload.
- Config A used as the denominator instead of config B.
- A dashboard value typed by hand.
- Config C run with zero DRAM or NVMe hits.
- Pre-event project code in a Classic track submission.

**Gates.** G1 needs M1 to M7. G2 needs P1 to P6. G3 needs S1 to S5. G4 needs D1, D2 and V1 to V3. G5 (submit) needs every Blocker plus E1 to E4.

**Agent check protocol.** Runs every 3 hours, on every push to main, and at each gate.

```text
You are the Headroom depth checker.
1. Pull main. Record the commit hash.
2. Run: make bench-smoke, make correctness, make audit-prices,
   make caps-test, make replay-test, make reconcile.
3. Query: HashScan for the last 20 payment transactions, the HCS topic
   message count, Arc escrow events, and distinct external wallets in the ledger.
4. For each row of the depth bar, set Status to Pass or Fail using only
   evidence produced in this run. Never carry a Pass forward.
5. Any Blocker fails: post "STOP: <IDs>" to the team channel, open one
   issue per failing check with its evidence, block merges until fixed.
6. A bar passed by a wide margin in two runs in a row: propose a tighter
   bar. Never loosen one.
7. Append one line to the check log below.
```

**Check log.**

| Time (IST) | Commit | Failing checks | Next action |
| --- | --- | --- | --- |
|  |  |  |  |

## 9. Partner track compliance

The picks are Hedera x402 ($6,500 pool, primary) and Chainlink CRE ($1,500). Arc ($3,000) is not pitched (decision 2026-11-06): Arc stays in the stack as the CRE write target, because CRE lists Arc Testnet but not Hedera as a supported network, and as the tab settlement chain; ticking it as a third prize on the form is optional and costs nothing. ETHGlobal allows up to 3 partner prizes per project, and multiple tracks from one partner count as one pick ([ETHGlobal rules](https://ethglobal.com/events/mumbai/info/details)). Requirements below are from the [Mumbai prizes page](https://ethglobal.com/events/mumbai/prizes/).

**Hedera: AI Agents That Pay, x402 on Hedera**

- [ ] At least one x402-protected endpoint settling on Hedera testnet or mainnet through a facilitator listed in the Hedera docs, or one we run
- [ ] An agent or client that finds the endpoint and completes at least one paid request end to end, with no human approving
- [ ] Public GitHub repo with a README covering setup, architecture and the payment flow, including at least one settled Hedera transaction ID
- [ ] Demo video of 5 minutes or less showing a payment settling, linked on HashScan
- [ ] Extra points: spending controls (F5), an HCS topic as a tamper-evident spend log (F6), settling in USDC via HTS

**Arc: Best Smart Contracts with Advanced Stablecoin Logic (not pitched; optional third pick)**

- [x] Contract deployed to Arc testnet from the CLI (judges confirmed Studio is optional)
- [ ] Escrow address, source link and lifecycle transactions in the submission, and the contract shown in the demo
- [ ] Working frontend and backend plus an architecture diagram
- [ ] Video covering core functions and the use of Arc and Circle tools, with documentation
- [ ] GitHub or Replit repo link
- [ ] Submission states which Arc bounty it targets
- [ ] USDC logic that is visibly advanced: conditional release, dispute window, multi-step settlement, software-to-software payment

**Chainlink: Best workflow with CRE**

- [ ] A CRE workflow built, simulated with the CRE CLI or deployed
- [ ] It connects at least one blockchain with an external API (the GPU price source)
- [ ] It is meaningfully used: its baseline sets c\_b in live pricing
- [x] Each relayed baseline is also published to its own HCS topic (`HCS_BASELINE_TOPIC_ID`), so Hedera holds the audit trail of the Chainlink price

**ETHGlobal rules**

- [ ] Classic track: all project work began after the hackathon started; only public libraries and starter kits predate it
- [ ] Partner prizes selected on the last step of the submission form: Hedera, Chainlink (Arc optional)
- [ ] Team members made meaningful contributions; AI use is described
- [ ] Finalist demo prepared to fit a 4-minute live presentation plus 3 minutes of questions ([format](https://hashtagweb3.com/ethglobal-mumbai))

**Not picked, and why.** 0G requires inference on 0G's own compute, so the node would not count. Whitechain's x402 track needs our own facilitator and relayer on a third chain. World, ENS, Arkiv, Uniswap, 1inch, Definitive and the Ethereum Foundation tracks have no natural fit.

## 10. Build plan

Five blocks of about 6 hours, each closed by a depth gate; submit by Nov 8, 2026 at 09:00 IST.

&#91;embedded content: Build plan · 5 blocks, 5 gates\]

A block is done only when its gate passes in the depth bar (section 8). If a gate slips, apply the cut order in section 4 before starting the next block.

| Workstream | Owns | Done when |
| --- | --- | --- |
| Infra | GPU node, vLLM + LMCache, harness, correctness test | G1 passes |
| Payments | x402 gateway, caps, HCS log, demo agent, discovery manifest | G2 passes |
| Contracts | Arc escrow (Foundry, CLI deploy), batch signer, reconcile script, CRE workflow | G3 and D1 pass |
| Product | Dashboard, distribution, interviews, video, README | G4 and G5 pass |
| Depth-check agent | Runs the section 8 protocol every 3 hours and on each push | Every run logged |

Working solo, run the blocks in order and keep the depth-check agent running alongside.

## 11. Demo script and demand validation

The demo proves the memory claim first, then the money loop, then demand. Every number on screen links to a CSV row or a transaction.

**Finalist demo, 4 minutes.**

1. **0:00 to 0:30, problem.** H200 rents are up about 160% this year against about 35% for H100, and the gap is memory. Agents hold HBM hostage while they wait on tools.
2. **0:30 to 1:15, memory proof.** Dashboard capacity curve, config B against C on the same GPU. Point at N\_C ÷ N\_B, the DRAM and NVMe hits, and the bit-exact check.
3. **1:15 to 2:30, live paid call on Hedera.** The demo agent hits the endpoint, gets a 402, pays in HTS USDC and streams. Open the HashScan transaction and the HCS audit entry, then show an over-cap request refused before the GPU and a replayed payment rejected.
4. **2:30 to 3:15, Chainlink baseline.** Run the CRE simulation live: Vast.ai fetch, consensus median, report. Show the relayed baseline on HCS and the price it sets; a receipt shows savings against the H200-equivalent.
5. **3:15 to 3:30, trust the meter.** One slide: a wrongly priced batch challenged with a Merkle proof and refunded (tab escrow, links in README).
6. **3:30 to 4:00, demand.** External paying teams, tokens served, two interview quotes, and the ask.

The Hedera video (5 minutes max) uses the same script, with an extra minute on the payment flow and spend controls.

**Distribution during the event.**

- The moment G2 passes, post the endpoint, `/discovery.json` and a 10-line client snippet in the ETHGlobal Discord and at the Hedera booth.
- Hedera x402 teams first: their qualification needs a paid endpoint their agent can call, and Headroom is one.
- Then any team building a long-context agent, in any track.
- Keep testnet prices tiny and ship a one-line USDC top-up script, so paying is never the blocker.

**Interview every paying team (3 questions).**

1. What do you pay per 1M tokens today for long-context calls, and to whom?
2. Would you route long-context agent calls here after Mumbai at 60% of the H200-equivalent price? At 80%?
3. What would make you stop using it after one week?

**Decision rules after Mumbai.**

| Signal | Decision |
| --- | --- |
| ≥ 5 external payers and ≥ 3 say yes at 60% | Continue: sign 3 design partners within 14 days |
| Payers exist but latency complaints dominate | Shift pricing toward deadline tiers (F15) on the same node |
| M2 fails: gain under 2x | Stop selling offload as the edge; keep the payment and receipt layer, find a different cost lever |
| ≤ 1 external payer | Stop: the channel or the need is not there |

## 12. Risks and open questions

The biggest risk is a gain under 2x, because it removes the reason to exist; the biggest schedule risk is GPU availability in block 1.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Gain under 2x | Medium | Fails M2, removes the edge | Realistic tool-call gaps, tuned chunk size, honest u reporting; the attribution table shows where gain comes from |
| No on-demand GPU with enough host RAM | Medium | Blocks G1 | Book two providers in block 1; fall back to a 48 GB GPU at 16K context, where the ratio still holds |
| vLLM and LMCache version mismatch | Medium | Lost hours | Pin versions in one Docker image; use only the documented connector |
| Chosen facilitator cannot settle USDC on HTS, or goes down | Low to medium | Blocks P1 | Integrate two listed facilitators; HBAR fallback, labelled in receipts |
| Other teams lack testnet USDC | High | Slows V1 | Faucet links and a one-line top-up script in the README; tiny prices |
| CRE simulation does not reach Arc (MockForwarder) | Certain in simulation | Baseline not on-chain from CRE itself | Arc testnet is a supported CRE target; for the demo, operator relays the simulated values on-chain labelled with `cre_run_id` |
| Judges read it as an LMCache wrapper | Medium | Lower scores | Lead with measured gain, attribution, memory math, pricing and settlement |
| Host DRAM prices keep rising | Medium | Smaller margin later | Host RAM and NVMe are inside c\_a; push cold KV to NVMe |
| Cross-tenant timing leak via shared prefixes | Low | Trust damage | Per-buyer cache salt (7.10) |
| Conservative quotes overcharge | Medium | Buyer distrust | Credit-back ledger (F12); receipts show quoted vs used |

**Open questions.**

- [ ] Which provider has an 80 GB GPU with at least 256 GB host RAM on demand right now?
- [x] Does CRE support Arc testnet as a write target? Yes, `arc-testnet`; simulation uses a MockForwarder (7.7).
- [x] Which listed Hedera facilitator settles USDC via HTS on testnet today? Blocky402: Spike B and the 50-request demo-agent run settled HTS USDC (README).
- [x] Which public source gives H100 and H200 rental prices for the CRE workflow? Vast.ai bundles API (keyless), RunPod GraphQL as fallback.
- [ ] Operator share k: test 0.2, 0.3 and 0.5 in interviews.
- [ ] Team roles, and who owns the depth-check agent.
- [x] Must the escrow be built in Arc Studio? No: the Arc judges confirmed any CLI deploy to Arc counts (2026-11-06). `contracts/src/HeadroomEscrow.sol` is the submission contract.

## Sources

- [ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes/)
- [ETHGlobal Mumbai rules and submission details](https://ethglobal.com/events/mumbai/info/details)
- [Hackathon tracker with submission deadline](https://github.com/Blockchains/hackathons/issues/7)
- [ETHGlobal Mumbai judging format](https://hashtagweb3.com/ethglobal-mumbai)
- [Hedera x402 docs](https://docs.hedera.com/solutions/ai/x402) and [facilitators](https://docs.hedera.com/solutions/ai/x402/facilitators)
- [Arc Studio](https://studio.arc.io)
- [Chainlink CRE docs](https://docs.chain.link/cre)
- [TrendForce: CXL expansion and KV cache compression](https://www.trendforce.com/research/download/RP260715HU)
- [Spheron: NVMe KV cache offloading with LMCache](https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/)
- [GPU Mart: KV cache offloading as a storage tier](https://rdp.in/gpu-mart/?p=2853)
- [Computerworld: agent inference costs per workflow](https://www.computerworld.com/article/4210786/ai-inference-is-getting-cheaper-but-your-agents-are-getting-more-expensive.html)
