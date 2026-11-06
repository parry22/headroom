/**
 * Headroom — price-baseline CRE workflow
 *
 * Every 15 minutes:
 *   1. (node mode, on every DON node) GET Vast.ai public bundles for H100 and H200,
 *      take the median $/hr of the returned offers. If Vast fails or returns no
 *      offers, fall back to RunPod's public GraphQL lowest on-demand price.
 *   2. (consensus) aggregate the per-node numbers with ConsensusAggregationByFields +
 *      median<number>() so one bad node cannot move the baseline.
 *   3. (DON mode) ABI-encode `(string gpuType, uint256 usdPerHourE6, uint256 timestamp)`
 *      — ONE REPORT PER GPU TYPE (two writeReport calls per run) — sign it with
 *      runtime.report(), and deliver it to PriceBaselineReceiver.onReport() via the
 *      Chainlink KeystoneForwarder on Arc Testnet.
 *
 * Why two reports instead of one carrying both prices: the consumer decodes exactly
 * the tuple the spec names (`abi.decode(report, (string, uint256, uint256))`), and the
 * per-gpuType monotonic-timestamp check in the contract stays trivial. The cost is a
 * second forwarder transaction per run, which at 15-minute cadence is negligible.
 *
 * `timestamp` is the cron trigger's scheduledExecutionTime (identical on every node,
 * so it survives consensus) — NOT wall-clock time. The consumer rejects any report
 * whose timestamp is <= the last accepted one for that gpuType (replay protection,
 * see docs: building-consumer-contracts#replay-attacks).
 *
 * No secrets are needed: both data sources are keyless public endpoints.
 */
import {
  ConsensusAggregationByFields,
  CronCapability,
  EVMClient,
  HTTPClient,
  Runner,
  TxStatus,
  bytesToHex,
  getNetwork,
  handler,
  hexToBase64,
  median,
  type CronPayload,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters, parseUnits, zeroAddress, type Address, type Hex } from "viem"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Config (config.staging.json / config.production.json)
// ---------------------------------------------------------------------------
const gpuSourceSchema = z.object({
  /** Label written onchain, e.g. "H100". */
  gpuType: z.string().min(1),
  /** Vast.ai bundles filter object; JSON-encoded + URL-encoded into the `q` query param. */
  vastQuery: z.record(z.unknown()),
  /** RunPod gpuTypes id, e.g. "NVIDIA H100 80GB HBM3". */
  runpodGpuId: z.string().min(1),
})

const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  consumerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  gasLimit: z.string(),
  httpTimeout: z.string(),
  vastBundlesUrl: z.string().url(),
  runpodGraphqlUrl: z.string().url(),
  gpus: z.object({
    h100: gpuSourceSchema,
    h200: gpuSourceSchema,
  }),
})

type Config = z.infer<typeof configSchema>
type GpuSource = z.infer<typeof gpuSourceSchema>

/** Per-node result; each field is aggregated with median() across the DON. */
type Baselines = {
  h100UsdPerHour: number
  h200UsdPerHour: number
}

// ABI layout of the report delivered to PriceBaselineReceiver.onReport().
const REPORT_ABI = parseAbiParameters("string gpuType, uint256 usdPerHourE6, uint256 timestamp")

// ---------------------------------------------------------------------------
// Node-mode fetching (runs independently on every DON node)
// ---------------------------------------------------------------------------
const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const decodeJson = (body: Uint8Array | string): unknown => {
  const text = typeof body === "string" ? Buffer.from(body, "base64").toString("utf-8") : new TextDecoder().decode(body)
  return JSON.parse(text)
}

/**
 * Vast.ai: GET https://console.vast.ai/api/v0/bundles/?q=<urlencoded JSON>
 * Response: { offers: [{ dph_total: number, ... }, ...] }  (verified live 2026-11-06, no auth)
 */
const fetchVastMedian = (
  nodeRuntime: NodeRuntime<Config>,
  http: HTTPClient,
  config: Config,
  src: GpuSource,
): number => {
  const url = `${config.vastBundlesUrl}?q=${encodeURIComponent(JSON.stringify(src.vastQuery))}`
  const resp = http
    .sendRequest(nodeRuntime, {
      url,
      method: "GET",
      multiHeaders: { Accept: { values: ["application/json"] } },
      timeout: config.httpTimeout,
    })
    .result()
  if (resp.statusCode !== 200) {
    throw new Error(`vast ${src.gpuType}: HTTP ${resp.statusCode}`)
  }
  const data = decodeJson(resp.body) as { offers?: Array<{ dph_total?: unknown }> }
  const prices = (data.offers ?? [])
    .map((o) => o.dph_total)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
  if (prices.length === 0) {
    throw new Error(`vast ${src.gpuType}: no rentable offers`)
  }
  const m = medianOf(prices)
  nodeRuntime.log(`vast ${src.gpuType}: ${prices.length} offers, median ${m.toFixed(4)} $/hr`)
  return m
}

/**
 * RunPod fallback: POST https://api.runpod.io/graphql
 * Body: {"query":"{ gpuTypes(input:{id:\"<id>\"}) { id lowestPrice(input:{gpuCount:1}) { uninterruptablePrice } } }"}
 * Response: { data: { gpuTypes: [{ lowestPrice: { uninterruptablePrice: number } }] } }  (verified live 2026-11-06)
 * CRE HTTP request bodies must be base64-encoded.
 */
const fetchRunpodPrice = (
  nodeRuntime: NodeRuntime<Config>,
  http: HTTPClient,
  config: Config,
  src: GpuSource,
): number => {
  const query = `{ gpuTypes(input:{id:"${src.runpodGpuId}"}) { id lowestPrice(input:{gpuCount:1}) { uninterruptablePrice } } }`
  const body = Buffer.from(JSON.stringify({ query })).toString("base64")
  const resp = http
    .sendRequest(nodeRuntime, {
      url: config.runpodGraphqlUrl,
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/json"] },
        Accept: { values: ["application/json"] },
      },
      body,
      timeout: config.httpTimeout,
    })
    .result()
  if (resp.statusCode !== 200) {
    throw new Error(`runpod ${src.gpuType}: HTTP ${resp.statusCode}`)
  }
  const data = decodeJson(resp.body) as {
    data?: { gpuTypes?: Array<{ lowestPrice?: { uninterruptablePrice?: unknown } }> }
  }
  const p = data.data?.gpuTypes?.[0]?.lowestPrice?.uninterruptablePrice
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) {
    throw new Error(`runpod ${src.gpuType}: no price in response`)
  }
  nodeRuntime.log(`runpod ${src.gpuType}: lowest on-demand ${p.toFixed(4)} $/hr`)
  return p
}

const fetchGpuPrice = (nodeRuntime: NodeRuntime<Config>, http: HTTPClient, config: Config, src: GpuSource): number => {
  try {
    return fetchVastMedian(nodeRuntime, http, config, src)
  } catch (e) {
    nodeRuntime.log(`vast ${src.gpuType} failed (${(e as Error).message}); falling back to runpod`)
    return fetchRunpodPrice(nodeRuntime, http, config, src)
  }
}

/** Executed on each node; the returned object is reduced by consensus (median per field). */
const fetchBaselines = (nodeRuntime: NodeRuntime<Config>): Baselines => {
  const http = new HTTPClient()
  const cfg = nodeRuntime.config
  return {
    h100UsdPerHour: fetchGpuPrice(nodeRuntime, http, cfg, cfg.gpus.h100),
    h200UsdPerHour: fetchGpuPrice(nodeRuntime, http, cfg, cfg.gpus.h200),
  }
}

// ---------------------------------------------------------------------------
// DON-mode: encode, sign, write
// ---------------------------------------------------------------------------
/** $/hr float -> uint256 with 6 decimals, via string to avoid float*1e6 rounding. */
const toE6 = (usdPerHour: number): bigint => parseUnits(usdPerHour.toFixed(6), 6)

const writeBaseline = (
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  gpuType: string,
  usdPerHourE6: bigint,
  timestamp: bigint,
): string => {
  const payload: Hex = encodeAbiParameters(REPORT_ABI, [gpuType, usdPerHourE6, timestamp])

  // Step 1: DON-signed report (encoder/signing/hashing are the EVM defaults).
  const report = runtime
    .report({
      encodedPayload: hexToBase64(payload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  // Step 2: deliver via the KeystoneForwarder -> consumer.onReport().
  const res = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()

  const txHash = bytesToHex(res.txHash ?? new Uint8Array(32))
  runtime.log(
    `writeReport ${gpuType}: txHash=${txHash} txStatus=${res.txStatus} receiverStatus=${res.receiverContractExecutionStatus}`,
  )
  if (res.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport ${gpuType} failed: status=${res.txStatus} ${res.errorMessage ?? ""}`)
  }
  return txHash
}

const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error("scheduledExecutionTime missing from cron payload")
  }
  // Deterministic across nodes; used as the monotonic replay guard in the consumer.
  const timestamp = BigInt(payload.scheduledExecutionTime.seconds)
  runtime.log(`price-baseline run scheduled at ${new Date(Number(timestamp) * 1000).toISOString()}`)

  const baselines = runtime
    .runInNodeMode(
      fetchBaselines,
      ConsensusAggregationByFields<Baselines>({
        h100UsdPerHour: median,
        h200UsdPerHour: median,
      }),
    )()
    .result()

  const h100E6 = toE6(baselines.h100UsdPerHour)
  const h200E6 = toE6(baselines.h200UsdPerHour)
  runtime.log(`consensus baselines: H100=${h100E6} e6 ($${baselines.h100UsdPerHour.toFixed(4)}/hr) H200=${h200E6} e6 ($${baselines.h200UsdPerHour.toFixed(4)}/hr)`)

  const summary = {
    timestamp: timestamp.toString(),
    h100UsdPerHourE6: h100E6.toString(),
    h200UsdPerHourE6: h200E6.toString(),
    txHashes: {} as Record<string, string>,
  }

  // Skip the onchain write while the consumer address is the zero placeholder so the
  // rest of the workflow (HTTP + consensus + encoding) can be simulated end-to-end.
  if ((runtime.config.consumerAddress as Address).toLowerCase() === zeroAddress) {
    runtime.log("consumerAddress is 0x0 placeholder: skipping onchain write (set it in config.staging.json)")
    return JSON.stringify(summary)
  }

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName })
  if (!network) {
    throw new Error(`unknown chainSelectorName ${runtime.config.chainSelectorName}`)
  }
  const evmClient = new EVMClient(network.chainSelector.selector)

  summary.txHashes[runtime.config.gpus.h100.gpuType] = writeBaseline(
    runtime,
    evmClient,
    runtime.config.gpus.h100.gpuType,
    h100E6,
    timestamp,
  )
  summary.txHashes[runtime.config.gpus.h200.gpuType] = writeBaseline(
    runtime,
    evmClient,
    runtime.config.gpus.h200.gpuType,
    h200E6,
    timestamp,
  )
  return JSON.stringify(summary)
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner({ configSchema })
  await runner.run(initWorkflow)
}

main()
