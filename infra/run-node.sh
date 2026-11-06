#!/usr/bin/env bash
# Start the inference node in config A, B or C. Configs differ only in KV dtype and offload.
# Usage: infra/run-node.sh A|B|C [--no-wait]
# Runtime: Docker when available (two containers from $IMAGE); otherwise plain processes, for hosts that are
# themselves a container started from $IMAGE (Vast.ai, RunPod). Force with NODE_RUNTIME=docker|process.
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
MODEL=${MODEL:-RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8}
VLLM_PORT=${VLLM_PORT:-8000}
LMCACHE_PORT=${LMCACHE_PORT:-5555}
LMCACHE_HTTP_PORT=${LMCACHE_HTTP_PORT:-8080}
HF_CACHE=${HF_CACHE:-$HOME/.cache/huggingface}
MAX_MODEL_LEN=${MAX_MODEL_LEN:-40960}
GPU_MEM_UTIL=${GPU_MEM_UTIL:-0.9}
SEED=${SEED:-1337}
RUNTIME=${NODE_RUNTIME:-$(command -v docker >/dev/null 2>&1 && echo docker || echo process)}
LOGDIR=${NODE_LOG_DIR:-$ROOT/infra/logs}
mkdir -p "$HF_CACHE" "$LOGDIR" && chmod 777 "$HF_CACHE"   # docker image runs as uid 1000

"$ROOT/infra/stop-node.sh" >/dev/null

LMCACHE_ARGS=()
KV_ARGS=()
if [ "$CONNECTOR" = "lmcache_mp" ]; then
  : "${LMCACHE_L1_GB:?set LMCACHE_L1_GB in .env}"
  : "${LMCACHE_L2_PATH:?set LMCACHE_L2_PATH in .env}"
  mkdir -p "$LMCACHE_L2_PATH" && chmod 777 "$LMCACHE_L2_PATH"
  LMCACHE_ARGS=(server
    --host 0.0.0.0 --port "$LMCACHE_PORT"
    --http-host 0.0.0.0 --http-port "$LMCACHE_HTTP_PORT"
    --l1-size-gb "$LMCACHE_L1_GB" --eviction-policy LRU
    --max-workers 8 --chunk-size 256
    --l2-adapter "{\"type\":\"fs_native\",\"base_path\":\"$LMCACHE_L2_PATH\",\"num_workers\":16,\"max_capacity_gb\":${LMCACHE_L2_GB:-0}}")
  KV_ARGS=(--kv-transfer-config "{\"kv_connector\":\"LMCacheMPConnector\",\"kv_role\":\"kv_both\",\"kv_connector_module_path\":\"lmcache.integration.vllm.lmcache_mp_connector\",\"kv_connector_extra_config\":{\"lmcache.mp.host\":\"tcp://localhost\",\"lmcache.mp.port\":$LMCACHE_PORT}}")
fi
VLLM_ARGS=("$MODEL"
  --port "$VLLM_PORT"
  --kv-cache-dtype "$KV_DTYPE"
  --max-model-len "$MAX_MODEL_LEN"
  --enable-prefix-caching
  --enable-prompt-tokens-details
  --gpu-memory-utilization "$GPU_MEM_UTIL"
  --max-num-seqs 128
  --seed "$SEED"
  "${KV_ARGS[@]}")

if [ ${#LMCACHE_ARGS[@]} -gt 0 ]; then
  if [ "$RUNTIME" = docker ]; then
    docker run -d --name headroom-lmcache --runtime nvidia --gpus all --network host --ipc host \
      -v "$LMCACHE_L2_PATH:$LMCACHE_L2_PATH" --entrypoint lmcache "$IMAGE" "${LMCACHE_ARGS[@]}"
  else
    nohup lmcache "${LMCACHE_ARGS[@]}" > "$LOGDIR/lmcache.log" 2>&1 &
    echo $! > "$LOGDIR/lmcache.pid"
  fi
  for _ in $(seq 1 60); do
    curl -fs "http://localhost:$LMCACHE_HTTP_PORT/healthcheck" >/dev/null 2>&1 && break
    sleep 2
  done
fi

if [ "$RUNTIME" = docker ]; then
  docker run -d --name headroom-vllm --runtime nvidia --gpus all --network host --ipc host \
    -e HF_TOKEN -e HF_HOME=/hf -v "$HF_CACHE:/hf" \
    "$IMAGE" "${VLLM_ARGS[@]}"
else
  HF_HOME="$HF_CACHE" nohup vllm serve "${VLLM_ARGS[@]}" > "$LOGDIR/vllm.log" 2>&1 &
  echo $! > "$LOGDIR/vllm.pid"
fi

echo "config=$CONFIG kv_dtype=$KV_DTYPE connector=$CONNECTOR model=$MODEL runtime=$RUNTIME image=$IMAGE"
if [ "${2:-}" != "--no-wait" ]; then
  for _ in $(seq 1 180); do
    curl -fs "http://localhost:$VLLM_PORT/health" >/dev/null 2>&1 && { echo "vllm ready"; exit 0; }
    sleep 5
  done
  echo "vllm did not become ready in 15 min" >&2
  if [ "$RUNTIME" = docker ]; then docker logs --tail 50 headroom-vllm >&2; else tail -50 "$LOGDIR/vllm.log" >&2; fi
  exit 1
fi
