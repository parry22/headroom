# Inference node

One GPU, one pinned image (`infra/VERSIONS.md`). Configs in `infra/configs/` differ only in KV dtype and offload.

| Config | KV | Offload | Containers |
| --- | --- | --- | --- |
| A | BF16 (`--kv-cache-dtype auto`) | none | `headroom-vllm` |
| B | FP8 | none | `headroom-vllm` |
| C | FP8 | LMCache MP: L1 CPU DRAM, L2 NVMe (`fs_native`) | `headroom-lmcache` + `headroom-vllm` |

## Bring-up

```bash
cp .env.example .env   # defaults fit a 24 GB GPU / 63 GB RAM box; HF_TOKEN not needed (ungated model)
# no Docker on the host (Vast.ai container from lmcache/vllm-openai:v0.5.6)? run-node.sh starts plain processes
infra/run-node.sh C
python3 infra/tierhit_smoke.py --fillers 80
infra/engine-info.sh
```

Pass signal for Spike A: `RESULT l1_hits>0 l2_hits>0 bit_exact=True -> PASS`.

## Endpoints

| URL | What |
| --- | --- |
| `http://localhost:8000/v1/chat/completions` | OpenAI-compatible, `usage.prompt_tokens_details.cached_tokens` present |
| `http://localhost:8000/metrics` | vLLM Prometheus: `vllm:external_prefix_cache_hits`, `vllm:kv_cache_usage_perc`, `vllm:num_preemptions`, `vllm:request_success` |
| `http://localhost:8080/metrics` | LMCache MP: `lmcache_mp_lookup_hit_l1*`, `lmcache_mp_lookup_hit_l2*`, `lmcache_mp_l1_memory_usage_bytes`, `lmcache_mp_l2_usage_bytes` (empty until first store) |
| `http://localhost:8080/clear-cache` (POST) | drop L1 between bench levels |

## Fallbacks

- `lmcache` CLI missing from the image: use `lmcache/standalone:<same tag>` for `headroom-lmcache` (set `IMAGE` per container in `run-node.sh`).
- FP8 KV + MP offload fails `tierhit_smoke.py`: try in-process `LMCacheConnectorV1` with `LMCACHE_LOCAL_DISK=file://...`; it has no L1/L2 hit split, so M1 would need log evidence. Report before switching.
