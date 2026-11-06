/** P5: a reused payment payload is rejected. Makes one real paid request with the demo agent's Hedera key, then resends the same PAYMENT-SIGNATURE. */
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { cfg } from "../src/config.js";

const GW = process.env.GATEWAY_URL ?? `http://localhost:${cfg.port}`;
const id = process.env.AGENT_HEDERA_ID, key = process.env.AGENT_HEDERA_KEY;
if (!id || !key) { console.error("replay-test needs AGENT_HEDERA_ID and AGENT_HEDERA_KEY in .env"); process.exit(2); }
const signer = createClientHederaSigner(id, PrivateKey.fromStringECDSA(key), { network: `hedera:${cfg.hederaNetwork}` });
const http = new x402HTTPClient(new x402Client().register("hedera:*", new ExactHederaScheme(signer)));
const body = JSON.stringify({ messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 4 });
const post = (headers: Record<string, string>) => fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

const r402 = await post({});
if (r402.status !== 402) { console.error(`expected 402, got ${r402.status}`); process.exit(1); }
const required = http.getPaymentRequiredResponse(n => r402.headers.get(n), await r402.json().catch(() => undefined));
const payload = await http.createPaymentPayload(required);
const headers = http.encodePaymentSignatureHeader(payload);
const paid = await post(headers);
const settle = paid.headers.get("payment-response");
console.log(`first use: status=${paid.status} payment-response=${settle ? JSON.parse(Buffer.from(settle, "base64").toString()).transaction : "none"}`);
await paid.text();
const replay = await post(headers);
const j: any = await replay.json().catch(() => ({}));
const pass = paid.status === 200 && replay.status === 402 && j.error === "payment_replayed";
console.log(`replay: status=${replay.status} error=${j.error}`);
console.log(`replay-test: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
