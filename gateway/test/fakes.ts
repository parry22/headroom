/** Standalone fake vLLM + fake facilitator for local manual runs of the gateway and agent. Tests only, never the demo path.
 *  tsx test/fakes.ts  -> vLLM on :18000, facilitator on :18402 */
import http from "node:http";
let calls = 0, settles = 0;
http.createServer((req, res) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
  if (req.url === "/health") { res.end("{}"); return; }
  if (req.url === "/tokenize") { const j = JSON.parse(b); const n = j.messages.reduce((s: number, m: any) => s + String(m.content).split(/\s+/).length, 0); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ count: Math.round(n * 1.3), max_model_len: 65536, tokens: [] })); return; }
  if (req.url === "/metrics") { res.end(`vllm:request_success_total ${calls}\nvllm:kv_cache_usage_perc 0.2\n`); return; }
  if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ object: "list", data: [{ id: "fake-model", max_model_len: 65536 }] })); return; }
  if (req.url === "/v1/chat/completions") {
    calls++; const j = JSON.parse(b); const n = j.messages.reduce((s: number, m: any) => s + String(m.content).split(/\s+/).length, 0);
    const usage = { prompt_tokens: Math.round(n * 1.3), completion_tokens: 7, prompt_tokens_details: { cached_tokens: Math.round(n * 0.6) } };
    if (j.stream) { res.setHeader("content-type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "fake reply from the node" }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", choices: [], usage })}\n\n`); res.end("data: [DONE]\n\n"); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "x", object: "chat.completion", model: "fake-model", choices: [{ index: 0, message: { role: "assistant", content: "fake reply from the node" }, finish_reason: "stop" }], usage })); return;
  }
  res.statusCode = 404; res.end();
}); }).listen(18000, "127.0.0.1", () => console.log("fake vllm :18000"));
http.createServer((req, res) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/supported") { res.end(JSON.stringify({ kinds: [{ x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: { feePayer: "0.0.7162784" } }], extensions: [], signers: { "hedera:*": ["0.0.7162784"] } })); return; }
  if (req.url === "/verify") { res.end(JSON.stringify({ isValid: true, payer: "0.0.777" })); return; }
  if (req.url === "/settle") { settles++; res.end(JSON.stringify({ success: true, transaction: `0.0.7162784@1700000000.${settles}`, network: "hedera:testnet", payer: "0.0.777" })); return; }
  res.statusCode = 404; res.end();
}); }).listen(18402, "127.0.0.1", () => console.log("fake facilitator :18402"));
