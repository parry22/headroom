/** Express app factory. index.ts boots it; tests build it with a fake vLLM and no facilitator calls. */
import express, { type Request, type Response } from "express";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { keccak256, toBytes } from "viem";
import { caip2, cfg } from "./config.js";
import { Ledger, type UsageRecord } from "./ledger.js";
import { PricingService } from "./pricingService.js";
import { quoteMicro, usageMicro } from "./pricing.js";
import { checkCaps } from "./caps.js";
import { countPromptTokens, metricsSnapshot, models, proxyChat, type ChatBody } from "./vllm.js";
import { ExpressAdapter, buildX402, type X402 } from "./x402.js";
import { HcsLog } from "./hcs.js";
import { leafHash, receiptSigner, requestIdHash, serializeReceipt, type ReceiptFields } from "./receipt.js";
import { chainEscrowReader, parseTabHeader, verifyTab, type EscrowReader } from "./tab.js";

export interface Deps { ledger: Ledger; pricing: PricingService; x402: X402; hcs: HcsLog; escrow: EscrowReader | null }

export function buildDeps(): Deps {
  const ledger = new Ledger(cfg.ledgerPath);
  return { ledger, pricing: new PricingService(ledger), x402: buildX402(), hcs: new HcsLog(ledger), escrow: cfg.arcEscrowAddress ? chainEscrowReader() : null };
}

const signer = cfg.receiptSigningKey ? receiptSigner(cfg.receiptSigningKey) : null;

export function createApp(d: Deps) {
  const app = express();
  app.use(express.json({ limit: "32mb" }));
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => { res.json({ ok: true, model: cfg.model, hcs: d.hcs.enabled(), hcs_pending: d.hcs.pending(), ts: Date.now() }); });
  app.get("/v1/models", async (_req, res) => {
    try { const m = await models(); res.json({ ...m, headroom: { max_model_len: cfg.maxModelLen, max_output_tokens: cfg.maxOutputTokens } }); }
    catch (e) { res.status(502).json({ error: "vllm_unreachable", message: (e as Error).message }); }
  });
  app.get("/pricing", (_req, res) => { res.json(d.pricing.publicView()); });
  app.get("/discovery.json", (_req, res) => {
    const p = d.pricing.publicView();
    res.json({
      name: "Headroom", version: "0.1", description: "Long-context inference on cheap memory, sold per token to agents.",
      endpoints: { chat: `${cfg.publicUrl}/v1/chat/completions`, models: `${cfg.publicUrl}/v1/models`, pricing: `${cfg.publicUrl}/pricing`, usage: `${cfg.publicUrl}/v1/usage`, budget: `${cfg.publicUrl}/v1/budget`, bench: `${cfg.publicUrl}/bench/latest` },
      payment: { protocol: "x402", version: 2, scheme: "exact", flow: "upfront", network: caip2, asset: cfg.hederaUsdcTokenId, asset_symbol: "USDC", payTo: cfg.hederaOperatorId, facilitator: cfg.facilitatorUrl, headers: ["PAYMENT-REQUIRED", "PAYMENT-SIGNATURE", "PAYMENT-RESPONSE"] },
      tab: cfg.arcEscrowAddress ? { network: `eip155:${cfg.arcChainId}`, escrow: cfg.arcEscrowAddress, studio: cfg.arcStudioUrl || undefined } : undefined,
      receipt: { type: "EIP-712", domain: { name: "Headroom", version: "1" }, signer: signer?.address ?? null, header: "X-Headroom-Receipt" },
      request_headers: { buyer: "X-Headroom-Buyer (Hedera account id, enables caps)", max_price: "X-Headroom-Max-Price (micro-USDC)", idempotency: "Idempotency-Key" },
      rates: p.rates, model: cfg.model, max_model_len: cfg.maxModelLen,
    });
  });
  app.get("/bench/latest", (_req, res) => {
    if (!fs.existsSync(cfg.benchLatest)) { res.status(404).json({ error: "no_bench_yet" }); return; }
    res.type("application/json").send(fs.readFileSync(cfg.benchLatest));
  });
  app.get("/v1/usage", (req, res) => {
    const buyer = String(req.query.buyer ?? req.headers["x-headroom-buyer"] ?? "");
    if (!buyer) { res.status(400).json({ error: "buyer_required" }); return; }
    res.json({ buyer, records: d.ledger.listByBuyer(buyer) });
  });
  app.put("/v1/budget", (req, res) => {
    const b = req.body ?? {};
    const buyer = String(b.buyer ?? req.headers["x-headroom-buyer"] ?? "");
    if (!buyer) { res.status(400).json({ error: "buyer_required" }); return; }
    d.ledger.setBudget({ buyer, daily_cap: b.daily_cap ?? null, max_price_per_request: b.max_price_per_request ?? null,
      allowlist: Array.isArray(b.allowlist) ? b.allowlist : [], session_keys: Array.isArray(b.session_keys) ? b.session_keys : [] });
    res.json({ ok: true, budget: d.ledger.getBudget(buyer) });
  });
  app.get("/v1/budget", (req, res) => {
    const buyer = String(req.query.buyer ?? req.headers["x-headroom-buyer"] ?? "");
    res.json(d.ledger.getBudget(buyer) ?? { buyer, daily_cap: null, max_price_per_request: null, allowlist: [], session_keys: [] });
  });

  app.post("/v1/chat/completions", (req, res) => { void chat(d, req, res); });
  return app;
}

/** Mode A request: caps -> quote -> 402 or verify+settle (upfront) -> stream -> finalize record -> HCS. */
async function chat(d: Deps, req: Request, res: Response): Promise<void> {
  const body = req.body as ChatBody;
  if (!body || !Array.isArray(body.messages)) { res.status(400).json({ error: "messages_required" }); return; }
  const maxTokens = Math.min(Number(body.max_tokens ?? 256), cfg.maxOutputTokens);
  const buyerHeader = req.header("x-headroom-buyer") || undefined;
  const requestId = randomUUID();
  const idem = req.header("idempotency-key");
  if (idem) { const prior = d.ledger.idempotent(idem, requestId); if (prior) { res.status(409).json({ error: "duplicate_request", request_id: prior, receipt: d.ledger.get(prior)?.receipt ?? null }); return; } }

  // 1. tokenize (CPU side) and quote. Caps are checked before any payment requirement is issued.
  const { count: promptTokens, estimated } = await countPromptTokens(body.messages);
  if (promptTokens + maxTokens > cfg.maxModelLen) { res.status(400).json({ error: "context_too_long", prompt_tokens: promptTokens, max_tokens: maxTokens, max_model_len: cfg.maxModelLen }); return; }
  const price = d.pricing.get();
  const quote = quoteMicro(price.rates.r_in, price.rates.r_out, promptTokens, maxTokens);
  const caps = checkCaps(d.ledger, buyerHeader, cfg.model, quote, req.header("x-headroom-max-price") || undefined);
  if (!caps.ok) { res.status(403).json({ error: caps.reason, ...caps.detail, quote_micro_usdc: quote, request_id: requestId }); return; }

  // Mode B: tab request signed by a registered session key; settles later in a batch on Arc.
  const tabHeader = req.header("x-headroom-tab");
  if (tabHeader) { await tab(d, req, res, body, tabHeader, { requestId, promptTokens, maxTokens, quote, price }); return; }

  // 2. x402: no header -> 402 with PAYMENT-REQUIRED; header -> verify, then settle before the handler (upfront flow).
  const adapter = new ExpressAdapter(req);
  adapter.quoteMicro = quote;
  const ctx = { adapter, path: req.path, method: req.method, paymentHeader: adapter.getHeader("payment-signature") };
  const payHeader = ctx.paymentHeader;
  if (payHeader) {
    // Replay protection in front of the facilitator: the same signed payload is never accepted twice.
    const key = keccak256(toBytes(payHeader));
    if (!d.ledger.markPayment(key, requestId)) { res.status(402).set("x-headroom-error", "payment_replayed").json({ error: "payment_replayed", request_id: requestId }); return; }
  }
  const result = await d.x402.http.processHTTPRequest(ctx);
  if (result.type === "payment-error") {
    res.status(result.response.status);
    for (const [k, v] of Object.entries(result.response.headers)) res.set(k, v);
    res.set("x-headroom-quote", String(quote)).set("x-headroom-request-id", requestId).set("x-headroom-prompt-tokens", String(promptTokens));
    if (result.response.isHtml) res.send(result.response.body); else res.json(result.response.body ?? { error: "payment_required", quote_micro_usdc: quote, prompt_tokens: promptTokens, max_tokens: maxTokens, tokens_estimated: estimated });
    return;
  }
  if (result.type !== "payment-verified" || !result.beforeHandlerSettlement) {
    res.status(500).json({ error: "unexpected_payment_state", type: result.type }); return;
  }
  const settle = result.beforeHandlerSettlement.result;
  const buyer = settle.payer ?? buyerHeader ?? "unknown";
  const rec: UsageRecord = {
    request_id: requestId, mode: "A", buyer, model: cfg.model, prompt_tokens: promptTokens, quoted_prompt_tokens: promptTokens, cached_tokens: 0, completion_tokens: 0, max_tokens: maxTokens,
    tier_l1_delta: null, tier_l2_delta: null, kv_bytes_peak: null, ttft_ms: null, latency_ms: null, gpu_seconds: null,
    unit_prices: { r_in: price.rates.r_in, r_cached: price.rates.r_cached, r_out: price.rates.r_out, price_version: price.version },
    price: quote, actual_cost: null, baseline_cost: null, payment_tx: settle.transaction, payment_asset: result.paymentRequirements.asset,
    hcs_seq: null, batch_id: null, status: "paid", created_at: Date.now(), receipt: null,
  };
  d.ledger.insert(rec);

  // 3. settled: stream from vLLM. Settlement headers go out before the first token.
  const settleHeaders = d.x402.http.createSettlementHeaders(settle);
  for (const [k, v] of Object.entries(settleHeaders)) res.set(k, v);
  res.set("x-headroom-request-id", requestId).set("x-headroom-quote", String(quote));
  const before = await metricsSnapshot();
  const stream = body.stream === true;
  res.status(200).type(stream ? "text/event-stream" : "application/json");
  if (stream) res.set("cache-control", "no-cache");
  let status = 200;
  try {
    const out = await proxyChat({ ...body, max_tokens: maxTokens }, chunk => { res.write(chunk); }, AbortSignal.timeout(600_000));
    status = out.status;
    const after = await metricsSnapshot();
    const actual = usageMicro(price.rates, out.usage.prompt_tokens, out.usage.cached_tokens, out.usage.completion_tokens);
    const costs = { actual_cost: Math.round(price.rates.c_a / price.rates.p * actual), baseline_cost: Math.round(price.rates.c_b / price.rates.p * actual) };
    const fields: ReceiptFields = {
      requestId: requestIdHash(requestId), buyer, promptTokens: BigInt(out.usage.prompt_tokens || promptTokens), cachedTokens: BigInt(out.usage.cached_tokens),
      completionTokens: BigInt(out.usage.completion_tokens), rIn: BigInt(price.rates.r_in), rCached: BigInt(price.rates.r_cached), rOut: BigInt(price.rates.r_out),
      price: BigInt(quote), timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    const receipt = signer ? serializeReceipt(fields, await signer.sign(fields), signer.address) : null;
    d.ledger.update(requestId, {
      prompt_tokens: Number(fields.promptTokens), cached_tokens: out.usage.cached_tokens, completion_tokens: out.usage.completion_tokens,
      ttft_ms: out.ttft_ms, latency_ms: out.latency_ms, gpu_seconds: out.latency_ms / 1000,
      tier_l1_delta: before.l1_hits != null && after.l1_hits != null ? after.l1_hits - before.l1_hits : null,
      tier_l2_delta: before.l2_hits != null && after.l2_hits != null ? after.l2_hits - before.l2_hits : null,
      ...costs, status: out.status === 200 ? "done" : "failed", receipt,
    });
    if (stream && receipt) res.write(`data: ${JSON.stringify({ headroom_receipt: receipt, request_id: requestId, leaf: leafHash(fields), payment_tx: settle.transaction })}\n\n`);
    else if (!stream) { /* receipt also available via /v1/usage */ }
    d.hcs.enqueue({ r: requestId, b: buyer, p: Number(fields.promptTokens), c: out.usage.cached_tokens, o: out.usage.completion_tokens, q: quote, tx: settle.transaction, t: Number(fields.timestamp), m: "A" });
  } catch (e) {
    status = 502;
    d.ledger.update(requestId, { status: "failed" });
    if (!stream) res.write(JSON.stringify({ error: "inference_failed", message: (e as Error).message, request_id: requestId, payment_tx: settle.transaction }));
  } finally {
    res.end();
  }
  void status;
}

/** Mode B: verify the session-key signature and escrow balance, serve, then record usage-priced (not conservative) for the next batch. */
async function tab(d: Deps, req: Request, res: Response, body: ChatBody, header: string,
                   q: { requestId: string; promptTokens: number; maxTokens: number; quote: number; price: ReturnType<PricingService["get"]> }): Promise<void> {
  if (!d.escrow) { res.status(503).json({ error: "tab_not_configured" }); return; }
  let t; try { t = parseTabHeader(header); } catch { res.status(400).json({ error: "bad_tab_header" }); return; }
  const bodyHash = keccak256(toBytes(JSON.stringify(body)));
  const buyer = String(t.buyer).toLowerCase();
  const outstanding = Number((d.ledger.db.prepare(`SELECT COALESCE(SUM(price),0) s FROM usage_record WHERE mode='B' AND buyer=? AND batch_id IS NULL AND status IN ('paid','done')`).get(buyer) as any).s);
  const v = await verifyTab(t, bodyHash, d.escrow, outstanding, q.quote);
  if (!v.ok) { res.status(402).json({ error: v.reason, ...("detail" in v ? v.detail : {}), quote_micro_usdc: q.quote, request_id: q.requestId }); return; }
  if (!d.ledger.markPayment(keccak256(toBytes(`tab:${buyer}:${t.nonce}`)), q.requestId)) { res.status(402).json({ error: "tab_nonce_replayed" }); return; }
  const rec: UsageRecord = {
    request_id: q.requestId, mode: "B", buyer, model: cfg.model, prompt_tokens: q.promptTokens, quoted_prompt_tokens: q.promptTokens, cached_tokens: 0, completion_tokens: 0, max_tokens: q.maxTokens,
    tier_l1_delta: null, tier_l2_delta: null, kv_bytes_peak: null, ttft_ms: null, latency_ms: null, gpu_seconds: null,
    unit_prices: { r_in: q.price.rates.r_in, r_cached: q.price.rates.r_cached, r_out: q.price.rates.r_out, price_version: q.price.version },
    price: q.quote, actual_cost: null, baseline_cost: null, payment_tx: null, payment_asset: `eip155:${cfg.arcChainId}/tab`, hcs_seq: null, batch_id: null,
    status: "paid", created_at: Date.now(), receipt: null,
  };
  d.ledger.insert(rec);
  res.set("x-headroom-request-id", q.requestId).set("x-headroom-quote", String(q.quote)).set("x-headroom-mode", "tab");
  const before = await metricsSnapshot();
  const stream = body.stream === true;
  res.status(200).type(stream ? "text/event-stream" : "application/json");
  try {
    const out = await proxyChat({ ...body, max_tokens: q.maxTokens }, chunk => { res.write(chunk); }, AbortSignal.timeout(600_000));
    const after = await metricsSnapshot();
    const price = usageMicro(q.price.rates, out.usage.prompt_tokens || q.promptTokens, out.usage.cached_tokens, out.usage.completion_tokens);
    const fields: ReceiptFields = {
      requestId: requestIdHash(q.requestId), buyer, promptTokens: BigInt(out.usage.prompt_tokens || q.promptTokens), cachedTokens: BigInt(out.usage.cached_tokens),
      completionTokens: BigInt(out.usage.completion_tokens), rIn: BigInt(q.price.rates.r_in), rCached: BigInt(q.price.rates.r_cached), rOut: BigInt(q.price.rates.r_out),
      price: BigInt(price), timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    const receipt = signer ? serializeReceipt(fields, await signer.sign(fields), signer.address) : null;
    d.ledger.update(q.requestId, {
      prompt_tokens: Number(fields.promptTokens), cached_tokens: out.usage.cached_tokens, completion_tokens: out.usage.completion_tokens, price,
      ttft_ms: out.ttft_ms, latency_ms: out.latency_ms, gpu_seconds: out.latency_ms / 1000,
      tier_l1_delta: before.l1_hits != null && after.l1_hits != null ? after.l1_hits - before.l1_hits : null,
      tier_l2_delta: before.l2_hits != null && after.l2_hits != null ? after.l2_hits - before.l2_hits : null,
      actual_cost: Math.round(q.price.rates.c_a / q.price.rates.p * price), baseline_cost: Math.round(q.price.rates.c_b / q.price.rates.p * price),
      status: out.status === 200 ? "done" : "failed", receipt,
    });
    if (stream && receipt) res.write(`data: ${JSON.stringify({ headroom_receipt: receipt, request_id: q.requestId, leaf: leafHash(fields), mode: "tab", price_micro_usdc: price })}\n\n`);
    d.hcs.enqueue({ r: q.requestId, b: buyer, p: Number(fields.promptTokens), c: out.usage.cached_tokens, o: out.usage.completion_tokens, q: price, tx: "tab", t: Number(fields.timestamp), m: "B" });
  } catch (e) {
    d.ledger.update(q.requestId, { status: "failed", price: 0 });
    if (!stream) res.write(JSON.stringify({ error: "inference_failed", message: (e as Error).message, request_id: q.requestId }));
  } finally { res.end(); }
}
