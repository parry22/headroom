#!/usr/bin/env bash
# Extract KV cache sizing from the vLLM startup log as JSON. Used for M6.
# Lines parsed (vLLM V1): "Available KV cache memory: 50.12 GiB", "GPU KV cache size: 1,234,567 tokens"
# Works for both node runtimes of infra/run-node.sh (Docker container or plain process).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOGDIR=${NODE_LOG_DIR:-$ROOT/infra/logs}
if command -v docker >/dev/null 2>&1 && docker inspect headroom-vllm >/dev/null 2>&1; then
  LOG=$(docker logs headroom-vllm 2>&1 || true)
  PYRUN=(docker exec headroom-vllm python3)
else
  LOG=$(cat "$LOGDIR/vllm.log" 2>/dev/null || true)
  PYRUN=(python3)
fi
mem=$(echo "$LOG" | grep -oE 'Available KV cache memory: [0-9.]+ GiB' | tail -1 | grep -oE '[0-9.]+' | head -1 || true)
tok=$(echo "$LOG" | grep -oE 'GPU KV cache size: [0-9,]+ tokens' | tail -1 | grep -oE '[0-9,]+' | tr -d , || true)
vllm_ver=$("${PYRUN[@]}" -c 'import vllm;print(vllm.__version__)' 2>/dev/null || echo unknown)
lm_ver=$("${PYRUN[@]}" -c 'import lmcache;print(lmcache.__version__)' 2>/dev/null || echo unknown)
printf '{"kv_cache_gib":%s,"kv_cache_tokens":%s,"vllm_version":"%s","lmcache_version":"%s"}\n' \
  "${mem:-null}" "${tok:-null}" "$vllm_ver" "$lm_ver"
