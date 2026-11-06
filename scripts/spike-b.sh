#!/usr/bin/env bash
# Spike B: one real x402 settlement on Hedera testnet through a listed facilitator, plus the replay check.
# Payment path is real (facilitator, HTS USDC). Inference is a local fake vLLM for this spike only; no GPU needed.
# Needs in .env: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, AGENT_HEDERA_ID, AGENT_HEDERA_KEY (ECDSA), both accounts USDC-associated, agent funded.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/gateway"
echo "== pre-flight"
pnpm -s exec tsx scripts/hedera-check.ts || { echo "fix the accounts above first (scripts/topup.sh <id> <key>, then faucet.circle.com)"; exit 1; }
echo "== start fake vLLM (spike only) and the gateway against the REAL facilitator"
pnpm -s exec tsx test/fakes.ts > /tmp/headroom-fakes.log 2>&1 & F=$!
sleep 2
export VLLM_URL=http://127.0.0.1:18000 LMCACHE_METRICS_URL=http://127.0.0.1:18000/metrics
export GATEWAY_PORT=${GATEWAY_PORT:-3000} LEDGER_PATH=./gateway/spike-b-ledger.db
export GPU_USD_PER_HR=${GPU_USD_PER_HR:-3} BOOTSTRAP_TOKENS_PER_HR_B=${BOOTSTRAP_TOKENS_PER_HR_B:-20000000} BOOTSTRAP_TOKENS_PER_HR_C=${BOOTSTRAP_TOKENS_PER_HR_C:-40000000}
unset X402_FACILITATOR_URL_OVERRIDE
pnpm -s exec tsx src/index.ts > /tmp/headroom-gateway.log 2>&1 & G=$!
trap 'kill $G $F 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null || { echo "gateway did not start:"; tail -20 /tmp/headroom-gateway.log; exit 1; }
grep -E "facilitator" /tmp/headroom-gateway.log | head -2
echo "== one paid request, then replay of the same payment"
GATEWAY_URL="http://127.0.0.1:$GATEWAY_PORT" pnpm -s exec tsx scripts/replay-test.ts; RC=$?
echo "== ledger"
pnpm -s exec tsx -e '
  import { Ledger } from "./src/ledger.js";
  const l = new Ledger("./spike-b-ledger.db");
  for (const r of l.db.prepare("select request_id,buyer,price,payment_tx,payment_asset,status,prompt_tokens,completion_tokens from usage_record").all()) console.log(JSON.stringify(r));
  for (const r of l.db.prepare("select request_id,buyer,price,payment_tx from usage_record where payment_tx is not null").all()) console.log("https://hashscan.io/testnet/transaction/" + r.payment_tx);'
echo "spike-b: $([ $RC = 0 ] && echo PASS || echo FAIL) (gateway log /tmp/headroom-gateway.log)"
exit $RC
