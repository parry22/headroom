# Headroom — Chainlink CRE `price-baseline` workflow

A Chainlink Runtime Environment (CRE) workflow that publishes a decentralised
**GPU on-demand price baseline** (median $/hr for H100 and H200) to the Headroom
escrow contract on **Arc Testnet** every 15 minutes.

```
cron (0 */15 * * * *)
  └─ node mode (every DON node): GET Vast.ai bundles → median dph_total
         └─ fallback: POST RunPod GraphQL lowestPrice.uninterruptablePrice
  └─ consensus: ConsensusAggregationByFields { h100: median, h200: median }
  └─ DON mode: abi.encode(string gpuType, uint256 usdPerHourE6, uint256 timestamp)
         → runtime.report() → EVMClient.writeReport()   (one report per GPU type)
  └─ KeystoneForwarder (arc-testnet) → PriceBaselineReceiver.onReport()
```

## Layout

```
cre/
├── project.yaml                  # targets + RPC (arc-testnet → https://rpc.testnet.arc.network)
├── .env.example                  # CRE_ETH_PRIVATE_KEY placeholder; copy to .env (git-ignored)
├── .gitignore
├── price-baseline/
│   ├── main.ts                   # the workflow (TypeScript SDK @chainlink/cre-sdk 1.23.0)
│   ├── workflow.yaml             # workflow names + artifact paths per target
│   ├── config.staging.json       # schedule, consumerAddress, data-source queries
│   ├── config.production.json
│   ├── package.json / tsconfig.json / bun.lock
│   └── binary.wasm               # build output (git-ignored)
├── consumer/
│   └── PriceBaselineReceiver.sol # IReceiver consumer, to be merged into the escrow contract
└── README.md
```

## What the workflow does (`price-baseline/main.ts`)

| Step | Where it runs | Detail |
| --- | --- | --- |
| Trigger | DON | `CronCapability.trigger({ schedule: "0 */15 * * * *" })` (6-field cron, seconds first). |
| Fetch | every node (`runtime.runInNodeMode`) | **Vast.ai** `GET https://console.vast.ai/api/v0/bundles/?q=<urlencoded JSON>` with the `vastQuery` from config (`H100 SXM` / `H200`,`H200 NVL`; rentable, 1 GPU, on-demand, limit 50). Median of `offers[].dph_total`. If the request fails or returns no offers → **RunPod** `POST https://api.runpod.io/graphql` (body base64-encoded as the CRE HTTP capability requires), reads `data.gpuTypes[0].lowestPrice.uninterruptablePrice`. Both endpoints are keyless; both verified live on 2026-11-06. |
| Consensus | DON | `ConsensusAggregationByFields<Baselines>({ h100UsdPerHour: median, h200UsdPerHour: median })`. A node that throws is simply excluded. |
| Encode | DON | `$/hr` → `uint256` with 6 decimals via `parseUnits(x.toFixed(6), 6)`. `timestamp` = cron `scheduledExecutionTime.seconds` (deterministic across nodes). |
| Report + write | DON | Per GPU type: `encodeAbiParameters("string gpuType, uint256 usdPerHourE6, uint256 timestamp")` → `runtime.report({ encoderName:"evm", signingAlgo:"ecdsa", hashingAlgo:"keccak256" })` → `evmClient.writeReport({ receiver: consumerAddress, report, gasConfig })`. Checks `txStatus === TxStatus.SUCCESS`. |

**Report format decision:** two reports per run (one per GPU type), each
`abi.encode(string, uint256, uint256)`. This matches the spec tuple exactly, keeps
the consumer's `abi.decode` and per-GPU monotonic check trivial, and costs one extra
forwarder tx every 15 minutes. If a single tx per run is later preferred, change
`REPORT_ABI` to `string[] gpuTypes, uint256[] usdPerHourE6, uint256 timestamp` and
the contract decode accordingly.

**Placeholder guard:** while `consumerAddress` is `0x000…000` the workflow logs
`skipping onchain write` after computing and logging the baselines, so the HTTP +
consensus path can be simulated before the contract exists.

## Consumer contract (`consumer/PriceBaselineReceiver.sol`)

Self-contained (no imports) `IReceiver` + ERC-165 implementation. Compiles with
solc 0.8.28 (`solcjs --optimize`, no warnings).

* `onReport(bytes metadata, bytes report)` — `msg.sender` must equal `forwarder`;
  decodes `(string gpuType, uint256 usdPerHourE6, uint256 timestamp)`; rejects
  `usdPerHourE6 == 0` and any `timestamp <= last accepted` for that gpuType
  (`StaleReport`), then stores and emits `BaselineSet(gpuType, usdPerHourE6, timestamp)`.
* `setBaseline(string,uint256,uint256)` — owner-only operator relay path, same
  monotonic rule.
* `setForwarder(address)`, `transferOwnership(address)` — owner-only.
* `getBaseline(string) → (usdPerHourE6, timestamp)`.
* `metadata` is not length-checked (the MockForwarder used by `cre workflow simulate`
  sends none; production sends a 64-byte slice). Add `workflowId`/owner checks after
  the workflow is deployed and its ID is known.

Forwarders on `arc-testnet` (from the CRE Forwarder Directory):

| Use | Address |
| --- | --- |
| production `KeystoneForwarder` | `0x76c9cf548b4179F8901cda1f8623568b58215E62` |
| simulation `MockForwarder` | `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` |

## Prerequisites

* CRE CLI — installed at `~/.local/bin/cre` (v1.39.0, darwin_arm64, codesign-verified).
  Add `export PATH=$HOME/.local/bin:$PATH` to your shell, or run `cre update`.
* Bun ≥ 1.2.21 — installed via `npm i -g bun` (1.4.4).
* Dependencies: `cd cre/price-baseline && bun install` (postinstall runs `bunx cre-setup`,
  which downloads Javy into `~/.cache/javy`).

## Build / typecheck (no login needed — verified working)

```bash
cd cre/price-baseline && bun run typecheck          # tsc --noEmit → clean
cd cre && cre workflow build price-baseline --target staging-settings --non-interactive
#   ✓ Workflow compiled successfully
#   Binary hash: afa80d0e18403524ded733e6010e4be2e29fa5f1e27f1e1c373e0d1a37955e12
```

## Simulate (needs a human: `cre login`)

`cre workflow simulate` refuses to run without Chainlink Platform credentials:

```
✗ Authentication required: not logged in and no CRE_API_KEY set
```

What the human must do, from `cre/`:

```bash
export PATH=$HOME/.local/bin:$PATH
cre login                              # opens a browser; creates ~/.cre/cre.yaml
cp .env.example .env                   # then put a real 64-hex key in CRE_ETH_PRIVATE_KEY
                                       # (any key for dry-run; funded on Arc Testnet for --broadcast)
cre workflow simulate price-baseline --target staging-settings --non-interactive --trigger-index 0
```

Expected: `[USER LOG] vast H100: N offers, median …`, `… consensus baselines: …`,
then `skipping onchain write` until `consumerAddress` is set.

To test the real write path:

1. Deploy `PriceBaselineReceiver` on Arc Testnet with the **MockForwarder**
   constructor arg (table above).
2. Put its address in `price-baseline/config.staging.json → consumerAddress`.
3. `cre workflow simulate price-baseline --target staging-settings --broadcast`
   (wallet in `.env` must hold Arc Testnet gas).
4. For production deploy, call `setForwarder(0x76c9…5E62)` (or deploy a fresh
   instance with it), set `config.production.json`, then `cre workflow deploy`.

Alternative headless auth: set `CRE_API_KEY` (Chainlink Platform → Organization →
API Keys) instead of `cre login`.

## Verified vs. not verified

Verified on 2026-11-06:

* Vast.ai bundles endpoint: HTTP 200, no auth, `offers[].dph_total` floats
  (H100 SXM: 4 offers; H200/H200 NVL: 20 offers).
* RunPod GraphQL: HTTP 200, `uninterruptablePrice` 2.69 (H100) / 3.59 (H200).
* Arc Testnet RPC `https://rpc.testnet.arc.network` answers `eth_chainId = 0x4cef52` (5042002).
* `arc-testnet` is present in `@chainlink/cre-sdk@1.23.0` chain-selector tables
  (selector 3034092155422581607) and in the CRE supported-networks + forwarder docs.
* TypeScript typecheck and `cre workflow build` succeed; Solidity compiles.

Not verified (blocked on `cre login`):

* End-to-end simulation output, consensus serialisation of the `Baselines` object,
  and the dry-run/broadcast `writeReport` against Arc Testnet.
* Whether the CRE HTTP capability's egress reaches `console.vast.ai` / `api.runpod.io`
  from DON nodes (no redirects observed locally; the docs forbid 3xx).
* Gas limit `500000` is a guess; adjust after the first real write.
* The Vast.ai `limit: 50` cap and the exact `gpu_name` strings may drift over time.
