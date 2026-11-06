#!/usr/bin/env bash
# Start the inference node in config A, B or C. Configs differ only in KV dtype and offload.
# Usage: infra/run-node.sh A|B|C [--no-wait]
set -euo pipefail
CONFIG=${1:?usage: run-node.sh A|B|C}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
# shellcheck disable=SC1090
source "$ROOT/infra/configs/$CONFIG.env"
set +a

IMAGE=${IMAGE:-lmcache/vllm-openai:v0.5.6}
MODEL=${MODEL:-meta-llama/Llama-3.1-8B-Instruct}
VLLM_PORT=${VLLM_PORT:-8000}
LMCACHE_PORT=${LMCACHE_PORT:-5555}
LMCACHE_HTTP_PORT=${LMCACHE_HTTP_PORT:-8080}
HF_CACHE=${HF_CACHE:-$HOME/.cache/huggingface}
MAX_MODEL_LEN=${MAX_MODEL_LEN:-65536}
SEED=${SEED:-1337}
mkdir -p "$HF_CACHE" && chmod 777 "$HF_CACHE"   # image runs as uid 1000

docker rm -f headroom-vllm headroom-lmcache >/dev/null 2>&1 || true

KV_ARGS=()
if [ "$CONNECTOR" = "lmcache_mp" ]; then
  : "${LMCACHE_L1_GB:?set LMCACHE_L1_GB in .env}"
  : "${LMCACHE_L2_PATH:?set LMCACHE_L2_PATH in .env}"
  mkdir -p "$LMCACHE_L2_PATH" && chmod 777 "$LMCACHE_L2_PATH"
  docker run -d --name headroom-lmcache --runtime nvidia --gpus all --network host --ipc host \
    -v "$LMCACHE_L2_PATH:$LMCACHE_L2_PATH" \
    --entrypoint lmcache "$IMAGE" server \
    --host 0.0.0.0 --port "$LMCACHE_PORT" \
    --http-host 0.0.0.0 --http-port "$LMCACHE_HTTP_PORT" \
    --l1-size-gb "$LMCACHE_L1_GB" --eviction-policy LRU \
    --max-workers 8 --chunk-size 256 \
    --l2-adapter "{\"type\":\"fs_native\",\"base_path\":\"$LMCACHE_L2_PATH\",\"num_workers\":16,\"max_capacity_gb\":${LMCACHE_L2_GB:-0}}"
  KV_ARGS=(--kv-transfer-config "{\"kv_connector\":\"LMCacheMPConnector\",\"kv_role\":\"kv_both\",\"kv_connector_module_path\":\"lmcache.integration.vllm.lmcache_mp_connector\",\"kv_connector_extra_config\":{\"lmcache.mp.host\":\"tcp://localhost\",\"lmcache.mp.port\":$LMCACHE_PORT}}")
  for _ in $(seq 1 60); do
    curl -fs "http://localhost:$LMCACHE_HTTP_PORT/healthcheck" >/dev/null 2>&1 && break
    sleep 2
  done
fi

docker run -d --name headroom-vllm --runtime nvidia --gpus all --network host --ipc host \
  -e HF_TOKEN -e HF_HOME=/hf -v "$HF_CACHE:/hf" \
  "$IMAGE" "$MODEL" \
  --port "$VLLM_PORT" \
  --kv-cache-dtype "$KV_DTYPE" \
  --max-model-len "$MAX_MODEL_LEN" \
  --enable-prefix-caching \
  --enable-prompt-tokens-details \
  --gpu-memory-utilization 0.9 \
  --max-num-seqs 128 \
  --seed "$SEED" \
  "${KV_ARGS[@]}"

echo "config=$CONFIG kv_dtype=$KV_DTYPE connector=$CONNECTOR image=$IMAGE"
if [ "${2:-}" != "--no-wait" ]; then
  for _ in $(seq 1 180); do
    curl -fs "http://localhost:$VLLM_PORT/health" >/dev/null 2>&1 && { echo "vllm ready"; exit 0; }
    sleep 5
  done
  echo "vllm did not become ready in 15 min" >&2
  docker logs --tail 50 headroom-vllm >&2
  exit 1
fi
