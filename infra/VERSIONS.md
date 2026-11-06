# Pinned versions

| Component | Pin | Source |
| --- | --- | --- |
| Docker image | `lmcache/vllm-openai:v0.5.6` (LMCache 0.5.6, built 2026-10-16) | hub.docker.com/r/lmcache/vllm-openai |
| LMCache | 0.5.6 | pypi.org/project/lmcache |
| vLLM | FILL AFTER SPIKE A: `docker run --rm --entrypoint pip lmcache/vllm-openai:v0.5.6 show vllm` (expected 0.31.0; the image installs vLLM unpinned at build time) | github.com/LMCache/LMCache/blob/v0.5.6/docker/Dockerfile |
| Model | `RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8` (ungated FP8 weights of Llama 3.1 8B Instruct, compressed-tensors, 9.1 GB; 32 layers, 8 KV heads, head dim 128, Llama 3.1 Community License; config checked 2026-11-06) | huggingface.co/RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8 |
| Node GPU | RTX 4090 24 GB (Ada, sm_89), host driver CUDA ≥ 13.0 | Vast.ai |
| CUDA | image is CUDA 13.0 | LMCache installation page |

Checked against source on 2026-11-06 (no GPU needed):
- The image puts `/opt/venv/bin` on `PATH` and installs the `lmcache` wheel, whose console script `lmcache` has a `server` subcommand, so `--entrypoint lmcache ... server` in `run-node.sh` works.
- Every `lmcache server` flag in `run-node.sh` (`--host --port --http-host --http-port --l1-size-gb --eviction-policy --max-workers --chunk-size --l2-adapter`) exists at tag v0.5.6, and the `fs_native` adapter accepts `base_path`, `num_workers`, `max_capacity_gb`.
- `LMCacheMPConnector` at v0.5.6 reads `lmcache.mp.host` / `lmcache.mp.port` from `kv_connector_extra_config`.
- vLLM main logs `Available KV cache memory: X GiB` and `GPU KV cache size: N tokens, ...` in the forms `infra/engine-info.sh` parses, and `POST /tokenize` returns `count`. Re-check against the vLLM version actually in the image after Spike A.

Known issue: LMCache#6126, MP-mode L2 `serde: fp8` corrupts FP8 KV. No fp8 serde is configured here. `make correctness` is the guard.
