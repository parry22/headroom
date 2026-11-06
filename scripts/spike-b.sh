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
TSX=./node_modules/.bin/tsx   # run tsx directly: a pnpm wrapper does not forward signals, which left gateways running
for port in 18000 "${GATEWAY_PORT:-3000}"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $port already in use (old gateway or fake still running?):"; lsof -nP -iTCP:"$port" -sTCP:LISTEN; exit 1; fi
done
stop() { for p in "$@"; do pkill -TERM -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; for _ in $(seq 1 25); do kill -0 "$@" 2>/dev/null || return 0; sleep 1; done; for p in "$@"; do pkill -9 -P "$p" 2>/dev/null; kill -9 "$p" 2>/dev/null; done; }
$TSX test/fakes.ts > /tmp/headroom-fakes.log 2>&1 & F=$!
sleep 2
export VLLM_URL=http://127.0.0.1:18000 LMCACHE_METRICS_URL=http://127.0.0.1:18000/metrics
export GATEWAY_PORT=${GATEWAY_PORT:-3000} LEDGER_PATH=./gateway/spike-b-ledger.db
export GPU_USD_PER_HR=${GPU_USD_PER_HR:-3} BOOTSTRAP_TOKENS_PER_HR_B=${BOOTSTRAP_TOKENS_PER_HR_B:-20000000} BOOTSTRAP_TOKENS_PER_HR_C=${BOOTSTRAP_TOKENS_PER_HR_C:-40000000}
unset X402_FACILITATOR_URL_OVERRIDE
$TSX src/index.ts > /tmp/headroom-gateway.log 2>&1 & G=$!
trap 'stop $G $F' EXIT
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null || { echo "gateway did not start:"; tail -20 /tmp/headroom-gateway.log; exit 1; }
grep -E "facilitator" /tmp/headroom-gateway.log | head -2
echo "== one paid request, then replay of the same payment"
GATEWAY_URL="http://127.0.0.1:$GATEWAY_PORT" pnpm -s exec tsx scripts/replay-test.ts; RC=$?
echo "== wait for HCS audit messages"
sleep 2   # let the last streamed request finish and queue its message
for _ in $(seq 1 60); do U=$(curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" | node -pe 'JSON.parse(require("fs").readFileSync(0)).hcs_unsent' 2>/dev/null); [ "$U" = 0 ] && break; sleep 1; done
echo "hcs_unsent=${U:-?} topic: https://hashscan.io/testnet/topic/${HCS_TOPIC_ID:-$(grep -E '^HCS_TOPIC_ID=' "$ROOT/.env" | cut -d= -f2 | cut -d' ' -f1)}"
echo "== ledger"
pnpm -s exec tsx scripts/print-ledger.ts ./spike-b-ledger.db
echo "spike-b: $([ $RC = 0 ] && echo PASS || echo FAIL) (gateway log /tmp/headroom-gateway.log)"
exit $RC
