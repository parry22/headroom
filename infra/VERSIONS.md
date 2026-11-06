# Pinned versions

| Component | Pin | Source |
| --- | --- | --- |
| Docker image | `lmcache/vllm-openai:v0.5.6` (LMCache 0.5.6, built 2026-10-16) | hub.docker.com/r/lmcache/vllm-openai |
| LMCache | 0.5.6 | pypi.org/project/lmcache |
| vLLM | FILL AFTER SPIKE A: `docker run --rm --entrypoint pip lmcache/vllm-openai:v0.5.6 show vllm` (expected 0.31.0; the image installs vLLM unpinned at build time) | github.com/LMCache/LMCache/blob/v0.5.6/docker/Dockerfile |
| Model | `meta-llama/Llama-3.1-8B-Instruct` (32 layers, 8 KV heads, head dim 128, 128K context, Llama 3.1 Community License) | huggingface.co/meta-llama/Llama-3.1-8B-Instruct |
| CUDA | image is CUDA 13.0 | LMCache installation page |

Known issue: LMCache#6126, MP-mode L2 `serde: fp8` corrupts FP8 KV. No fp8 serde is configured here. `make correctness` is the guard.
