/**
 * Demo buyer agent (F10, P2): a budget-aware long-context agent that pays per request over x402 on Hedera
 * with no human in the loop, slows down when funds run low, and stops at the cap.
 *
 * Env: GATEWAY_URL, AGENT_HEDERA_ID, AGENT_HEDERA_KEY (ECDSA hex), AGENT_BUDGET_USDC, AGENT_TURNS, HEDERA_NETWORK
 * Log: agent/logs/demo-<ts>.jsonl, one line per turn with the Hedera transaction id.
 */
import { config as loadDotenv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, "..", "..", ".env") });

const GW = process.env.GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 3000}`;
const ID = process.env.AGENT_HEDERA_ID!, KEY = process.env.AGENT_HEDERA_KEY!;
const NETWORK = `hedera:${process.env.HEDERA_NETWORK ?? "testnet"}`;
const BUDGET = Math.round(Number(process.env.AGENT_BUDGET_USDC ?? "1") * 1e6);   // micro-USDC
const TURNS = Number(process.env.AGENT_TURNS ?? 20);
const CONTEXT_WORDS = Number(process.env.AGENT_CONTEXT_WORDS ?? 6000);          // ~8K tokens of "repo" context
if (!ID || !KEY) { console.error("AGENT_HEDERA_ID / AGENT_HEDERA_KEY missing"); process.exit(2); }

const signer = createClientHederaSigner(ID, PrivateKey.fromStringECDSA(KEY), { network: NETWORK as `${string}:${string}` });
const payingFetch = wrapFetchWithPayment(fetch, new x402Client().register("hedera:*", new ExactHederaScheme(signer)));

// Capture settlement headers per request so each turn logs its Hedera transaction id and charged quote.
let lastTx: string | null = null, lastQuote = 0, lastRequestId: string | null = null;
const trackedFetch: typeof fetch = async (url, init) => {
  const r = await payingFetch(url, init);
  const pr = r.headers.get("payment-response");
  lastTx = pr ? decodePaymentResponseHeader(pr).transaction : null;
  lastQuote = Number(r.headers.get("x-headroom-quote") ?? 0);
  lastRequestId = r.headers.get("x-headroom-request-id");
  return r;
};
const openai = new OpenAI({ baseURL: `${GW}/v1`, apiKey: "x402", fetch: trackedFetch, maxRetries: 0 });

const logPath = path.resolve(here, "..", "logs", `demo-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const log = (o: unknown) => { const line = JSON.stringify(o); fs.appendFileSync(logPath, line + "\n"); console.log(line); };

// Synthetic long context: a "repository" the agent keeps reasoning over, growing with each tool result.
const words = "ledger kernel memory tensor cache token agent tool budget receipt batch escrow quote settle prefix context session offload reload latency throughput".split(" ");
const salad = (seed: number, n: number) => { let x = seed; return Array.from({ length: n }, () => { x = (x * 1103515245 + 12345) % 2147483648; return words[x % words.length]; }).join(" "); };
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a coding agent working through a large repository. Keep answers under 120 words." },
  { role: "user", content: `Repository snapshot:\n${salad(7, CONTEXT_WORDS)}\n\nTask: find where the budget check happens and plan the next tool call.` },
];

let spent = 0, turns = 0, txs: string[] = [];
log({ event: "start", gateway: GW, buyer: ID, network: NETWORK, budget_micro_usdc: BUDGET, turns: TURNS, log: logPath });
for (let t = 1; t <= TURNS; t++) {
  const remaining = BUDGET - spent;
  const share = spent / BUDGET;
  // Graceful degradation: past 80% of the budget, halve output and wait longer between turns; at the cap, stop.
  const lowFunds = share >= 0.8;
  const maxTokens = lowFunds ? 64 : 160;
  if (remaining <= 0) { log({ event: "stop", reason: "budget_exhausted", spent, turns }); break; }
  const t0 = Date.now();
  try {
    const res = await openai.chat.completions.create(
      { model: "headroom", messages, max_tokens: maxTokens, temperature: 0 },
      { headers: { "x-headroom-buyer": ID, "x-headroom-max-price": String(remaining) } },
    );
    const text = res.choices[0]?.message?.content ?? "";
    spent += lastQuote; turns++;
    if (lastTx) txs.push(lastTx);
    log({ event: "turn", turn: t, request_id: lastRequestId, tx: lastTx, hashscan: lastTx ? `https://hashscan.io/${NETWORK.split(":")[1]}/transaction/${lastTx}` : null,
          quote_micro_usdc: lastQuote, spent_micro_usdc: spent, budget_share: Number((spent / BUDGET).toFixed(3)), low_funds: lowFunds,
          prompt_tokens: res.usage?.prompt_tokens, cached_tokens: (res.usage as any)?.prompt_tokens_details?.cached_tokens, completion_tokens: res.usage?.completion_tokens, ms: Date.now() - t0 });
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Tool result (turn ${t}):\n${salad(100 + t, 1500)}\n\nContinue.` });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    log({ event: "error", turn: t, status: e?.status, message: msg.slice(0, 200) });
    if (e?.status === 403 || /price_above_max|daily_cap/.test(msg)) { log({ event: "stop", reason: "cap_refused", spent, turns }); break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  await new Promise(r => setTimeout(r, lowFunds ? 8000 : 2000));   // tool-call gap; longer when funds are low
}
log({ event: "done", turns, paid_requests: txs.length, spent_micro_usdc: spent, budget_micro_usdc: BUDGET, tx_ids: txs });
process.exit(turns === TURNS ? 0 : 1);
