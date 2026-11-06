/** P4: three over-cap requests are refused and the vLLM request counter does not move. Runs against a live gateway + node. */
const GW = process.env.GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 3000}`;
const VLLM = process.env.VLLM_URL ?? "http://localhost:8000";
const counter = async () => {
  const t = await (await fetch(`${VLLM}/metrics`)).text();
  let total = 0, found = false;
  for (const line of t.split("\n")) { const mm = /^vllm:request_success(?:_total)?(?:\{[^}]*\})?\s+([0-9.eE+]+)/.exec(line); if (mm) { total += Number(mm[1]); found = true; } }
  return found ? total : NaN;
};
const msgs = [{ role: "user", content: "Say hi. " + "filler ".repeat(200) }];
const post = (headers: Record<string, string>, body: any) => fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const before = await counter();
await fetch(`${GW}/v1/budget`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ buyer: "0.0.1", daily_cap: 1 }) });
await fetch(`${GW}/v1/budget`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ buyer: "0.0.2", allowlist: ["not-this-model"] }) });
const cases: [string, Record<string, string>][] = [
  ["daily_cap_exceeded", { "x-headroom-buyer": "0.0.1" }],
  ["price_above_max", { "x-headroom-max-price": "0" }],
  ["model_not_allowlisted", { "x-headroom-buyer": "0.0.2" }],
];
let ok = true;
for (const [expected, h] of cases) {
  const r = await post(h, { messages: msgs, max_tokens: 16 });
  const j: any = await r.json().catch(() => ({}));
  const pass = r.status === 403 && j.error === expected;
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"} ${expected}: status=${r.status} error=${j.error}`);
}
await new Promise(r => setTimeout(r, 1000));
const after = await counter();
const moved = !(Number.isFinite(before) && Number.isFinite(after)) || after !== before;
console.log(`vllm:request_success before=${before} after=${after} ${moved ? "MOVED (FAIL)" : "unchanged"}`);
console.log(`caps-test: ${ok && !moved ? "PASS" : "FAIL"}`);
process.exit(ok && !moved ? 0 : 1);
