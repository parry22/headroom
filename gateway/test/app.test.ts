/** Gateway flow test with a fake facilitator and fake vLLM. Fakes are for tests only; the demo path never uses them. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

let vllmCalls = 0;
const fakeVllm = http.createServer((req, res) => {
  let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
    if (req.url === "/tokenize") { const j = JSON.parse(body); const n = j.messages.reduce((s: number, m: any) => s + m.content.split(" ").length, 0); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ count: n * 2, max_model_len: 65536, tokens: [] })); return; }
    if (req.url === "/metrics") { res.end(`vllm:request_success_total ${vllmCalls}\nvllm:kv_cache_usage_perc 0.1\n`); return; }
    if (req.url === "/v1/chat/completions") {
      vllmCalls++;
      res.setHeader("content-type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 16 } } })}\n\n`);
      res.end("data: [DONE]\n\n"); return;
    }
    res.statusCode = 404; res.end();
  });
});
let settleCalls = 0;
const fakeFacilitator = http.createServer((req, res) => {
  let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/supported") { res.end(JSON.stringify({ kinds: [{ x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: { feePayer: "0.0.7162784" } }], extensions: [], signers: { "hedera:*": ["0.0.7162784"] } })); return; }
    if (req.url === "/verify") { res.end(JSON.stringify({ isValid: true, payer: "0.0.777" })); return; }
    if (req.url === "/settle") { settleCalls++; res.end(JSON.stringify({ success: true, transaction: `0.0.7162784@1700000000.${settleCalls}`, network: "hedera:testnet", payer: "0.0.777" })); return; }
    res.statusCode = 404; res.end();
  });
});

let app: any, deps: any, base: string;
beforeAll(async () => {
  await new Promise<void>(r => fakeVllm.listen(0, "127.0.0.1", r));
  await new Promise<void>(r => fakeFacilitator.listen(0, "127.0.0.1", r));
  process.env.VLLM_URL = `http://127.0.0.1:${(fakeVllm.address() as AddressInfo).port}`;
  process.env.LMCACHE_METRICS_URL = `${process.env.VLLM_URL}/metrics`;
  process.env.X402_FACILITATOR_URL = `http://127.0.0.1:${(fakeFacilitator.address() as AddressInfo).port}`;
  process.env.HEDERA_OPERATOR_ID = "0.0.4242";
  process.env.GPU_USD_PER_HR = "3"; process.env.BOOTSTRAP_TOKENS_PER_HR_B = "20000000"; process.env.BOOTSTRAP_TOKENS_PER_HR_C = "40000000";
  process.env.RECEIPT_SIGNING_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const { Ledger } = await import("../src/ledger.js");
  const { PricingService } = await import("../src/pricingService.js");
  const { buildX402 } = await import("../src/x402.js");
  const { HcsLog } = await import("../src/hcs.js");
  const { createApp } = await import("../src/app.js");
  const ledger = new Ledger(":memory:");
  ledger.addPriceSnapshot({ ts: Date.now(), gpu_type: "H200", usd_per_hr: 3.9, source: "test" });
  deps = { ledger, pricing: new PricingService(ledger), x402: buildX402(), hcs: new HcsLog(ledger) };
  deps.pricing.refresh();
  await deps.x402.http.initialize();
  app = createApp(deps);
  const srv = await new Promise<http.Server>(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { fakeVllm.close(); fakeFacilitator.close(); });

const msgs = [{ role: "user", content: "one two three four five six seven eight nine ten" }];
const chat = (headers: Record<string, string> = {}, body: any = { messages: msgs, max_tokens: 5, stream: true }) =>
  fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("gateway", () => {
  it("returns 402 with PAYMENT-REQUIRED carrying the exact quote and feePayer, without touching vLLM inference", async () => {
    const r = await chat();
    expect(r.status).toBe(402);
    const pr = JSON.parse(Buffer.from(r.headers.get("payment-required")!, "base64").toString());
    expect(pr.x402Version).toBe(2);
    const acc = pr.accepts[0];
    expect(acc.network).toBe("hedera:testnet"); expect(acc.asset).toBe("0.0.429274"); expect(acc.payTo).toBe("0.0.4242");
    expect(acc.extra.feePayer).toBe("0.0.7162784"); expect(acc.extra.paymentFlow).toBe("upfront"); expect(acc.maxTimeoutSeconds).toBe(60);
    expect(acc.amount).toBe(r.headers.get("x-headroom-quote"));
    expect(Number(acc.amount)).toBeGreaterThan(0);
    expect(vllmCalls).toBe(0);
  });
  it("refuses over-cap requests before quoting a payment (P4)", async () => {
    await fetch(`${base}/v1/budget`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ buyer: "0.0.5", daily_cap: 1 }) });
    const r1 = await chat({ "x-headroom-buyer": "0.0.5" }); expect(r1.status).toBe(403); expect((await r1.json()).error).toBe("daily_cap_exceeded");
    const r2 = await chat({ "x-headroom-max-price": "0" }); expect(r2.status).toBe(403); expect((await r2.json()).error).toBe("price_above_max");
    const r3 = await chat({}, { messages: msgs, max_tokens: 100000 }); expect(r3.status).toBe(402); // max_tokens clamped to MAX_OUTPUT_TOKENS, still quoted
    expect(vllmCalls).toBe(0);
  });
  it("settles before streaming, records the request, signs a receipt, and rejects a replayed payment (P1, P3, P5)", async () => {
    const r402 = await chat();
    const pr = JSON.parse(Buffer.from(r402.headers.get("payment-required")!, "base64").toString());
    const payload = { x402Version: 2, resource: pr.resource, accepted: pr.accepts[0], payload: { transaction: Buffer.from("fake-signed-tx").toString("base64") } };
    const sig = Buffer.from(JSON.stringify(payload)).toString("base64");
    const r = await chat({ "payment-signature": sig });
    expect(r.status).toBe(200);
    const settle = JSON.parse(Buffer.from(r.headers.get("payment-response")!, "base64").toString());
    expect(settle.success).toBe(true); expect(settle.transaction).toMatch(/^0\.0\.7162784@/);
    const text = await r.text();
    expect(text).toContain("hello");
    expect(text).toContain("headroom_receipt");
    expect(vllmCalls).toBe(1);
    const id = r.headers.get("x-headroom-request-id")!;
    const rec = deps.ledger.get(id);
    expect(rec.status).toBe("done"); expect(rec.payment_tx).toBe(settle.transaction); expect(rec.buyer).toBe("0.0.777");
    expect(rec.prompt_tokens).toBe(40); expect(rec.cached_tokens).toBe(16); expect(rec.completion_tokens).toBe(5);
    expect(rec.price).toBe(Number(pr.accepts[0].amount));
    expect(rec.receipt).toBeTruthy();
    // replay: same header again is refused before the facilitator is asked
    const before = settleCalls;
    const rr = await chat({ "payment-signature": sig });
    expect(rr.status).toBe(402); expect((await rr.json()).error).toBe("payment_replayed");
    expect(settleCalls).toBe(before);
    expect(vllmCalls).toBe(1);
  });
  it("serves pricing and discovery with the baseline timestamp", async () => {
    const p = await (await fetch(`${base}/pricing`)).json();
    expect(p.rates.uncached_input).toBeGreaterThan(0); expect(p.baseline.stale).toBe(false); expect(p.c_b_modelled).toBe(true);
    const d = await (await fetch(`${base}/discovery.json`)).json();
    expect(d.payment.network).toBe("hedera:testnet"); expect(d.receipt.signer).toMatch(/^0x/);
  });
});
