#!/usr/bin/env bash
# Extract KV cache sizing from the vLLM startup log as JSON. Used for M6.
# Lines parsed (vLLM V1): "Available KV cache memory: 50.12 GiB", "GPU KV cache size: 1,234,567 tokens"
set -euo pipefail
LOG=$(docker logs headroom-vllm 2>&1 || true)
mem=$(echo "$LOG" | grep -oE 'Available KV cache memory: [0-9.]+ GiB' | tail -1 | grep -oE '[0-9.]+' | head -1 || true)
tok=$(echo "$LOG" | grep -oE 'GPU KV cache size: [0-9,]+ tokens' | tail -1 | grep -oE '[0-9,]+' | tr -d , || true)
vllm_ver=$(docker exec headroom-vllm python3 -c 'import vllm;print(vllm.__version__)' 2>/dev/null || echo unknown)
lm_ver=$(docker exec headroom-vllm python3 -c 'import lmcache;print(lmcache.__version__)' 2>/dev/null || echo unknown)
printf '{"kv_cache_gib":%s,"kv_cache_tokens":%s,"vllm_version":"%s","lmcache_version":"%s"}\n' \
  "${mem:-null}" "${tok:-null}" "$vllm_ver" "$lm_ver"
