"""Shared helpers for the Headroom benchmark harness. Stdlib + httpx only."""
from __future__ import annotations
import json, os, random, re, time
import httpx

VLLM_URL = os.environ.get("VLLM_URL", "http://localhost:8000")
LMCACHE_METRICS_URL = os.environ.get("LMCACHE_METRICS_URL", "http://localhost:8080/metrics")
MODEL = os.environ.get("MODEL", "RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8")

WORDS = ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau "
         "upsilon phi chi psi omega ledger kernel memory tensor cache token agent tool budget receipt batch "
         "escrow quote settle prefix context session offload reload latency throughput").split()

def salad(seed: int, words: int) -> str:
    rng = random.Random(seed)
    return " ".join(rng.choice(WORDS) for _ in range(words))

def shared_prefix(words: int) -> str:
    """Public tool schema prefix, identical for every session (PRD 7.2 isolation note)."""
    return ("You are a long-context coding agent. Tool schemas follow.\n" + salad(4242, words))

def calibrate_tokens_per_word(client: httpx.Client, words: int = 2000) -> float:
    """Measure tokens per word for this model so prompt sizes can be set in tokens."""
    body = {"model": MODEL, "prompt": salad(1, words), "max_tokens": 1, "temperature": 0}
    r = client.post(f"{VLLM_URL}/v1/completions", json=body, timeout=300)
    r.raise_for_status()
    return r.json()["usage"]["prompt_tokens"] / words

def words_for(tokens: int, tpw: float) -> int:
    return max(1, int(tokens / tpw))

_LINE = re.compile(r"^([A-Za-z_:][A-Za-z0-9_:]*)(\{[^}]*\})?\s+([-+0-9.eE]+|NaN)")

def parse_prom(text: str) -> dict[str, float]:
    """Sum every sample of each metric name across labels."""
    out: dict[str, float] = {}
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        m = _LINE.match(line)
        if not m or m.group(3) == "NaN":
            continue
        out[m.group(1)] = out.get(m.group(1), 0.0) + float(m.group(3))
    return out

def first_present(d: dict[str, float], *names: str) -> float | None:
    for n in names:
        if n in d:
            return d[n]
    return None

# Metric name candidates. vLLM counters carry _total; LMCache MP docs warn names may differ
# from the tables, so each column lists candidates in preference order.
VLLM_METRICS = {
    "vllm_kv_cache_usage_perc": ("vllm:kv_cache_usage_perc", "vllm:gpu_cache_usage_perc"),
    "vllm_prefix_cache_hits": ("vllm:prefix_cache_hits_total", "vllm:prefix_cache_hits"),
    "vllm_prefix_cache_queries": ("vllm:prefix_cache_queries_total", "vllm:prefix_cache_queries"),
    "vllm_external_prefix_cache_hits": ("vllm:external_prefix_cache_hits_total", "vllm:external_prefix_cache_hits"),
    "vllm_external_prefix_cache_queries": ("vllm:external_prefix_cache_queries_total", "vllm:external_prefix_cache_queries"),
    "vllm_num_preemptions": ("vllm:num_preemptions_total", "vllm:num_preemptions"),
    "vllm_request_success": ("vllm:request_success_total", "vllm:request_success"),
    "vllm_num_requests_running": ("vllm:num_requests_running",),
    "vllm_num_requests_waiting": ("vllm:num_requests_waiting",),
}
LMCACHE_METRICS = {
    "lmcache_lookup_requested": ("lmcache_mp_lookup_requested_total", "lmcache_mp_lookup_requested_tokens_total", "lmcache_mp_lookup_requested"),
    "lmcache_lookup_hit": ("lmcache_mp_lookup_hit_total", "lmcache_mp_lookup_hit_tokens_total", "lmcache_mp_lookup_hit"),
    "lmcache_lookup_hit_l1": ("lmcache_mp_lookup_hit_l1_total", "lmcache_mp_lookup_hit_l1_tokens_total", "lmcache_mp_lookup_hit_l1"),
    "lmcache_lookup_hit_l2": ("lmcache_mp_lookup_hit_l2_total", "lmcache_mp_lookup_hit_l2_tokens_total", "lmcache_mp_lookup_hit_l2"),
    "lmcache_l1_evicted": ("lmcache_mp_l1_evicted_total", "lmcache_mp_l1_evicted"),
    "lmcache_l2_store_completed_objects": ("lmcache_mp_l2_store_completed_objects_total", "lmcache_mp_l2_store_completed_objects"),
    "lmcache_l1_memory_usage_bytes": ("lmcache_mp_l1_memory_usage_bytes",),
    "lmcache_l2_usage_bytes": ("lmcache_mp_l2_usage_bytes",),
}

def snapshot(client: httpx.Client) -> dict[str, float | None]:
    row: dict[str, float | None] = {"ts": time.time()}
    try:
        v = parse_prom(client.get(f"{VLLM_URL}/metrics", timeout=10).text)
    except Exception:  # noqa: BLE001
        v = {}
    try:
        l = parse_prom(client.get(LMCACHE_METRICS_URL, timeout=10).text)
    except Exception:  # noqa: BLE001
        l = {}
    for col, names in VLLM_METRICS.items():
        row[col] = first_present(v, *names)
    for col, names in LMCACHE_METRICS.items():
        row[col] = first_present(l, *names)
    return row

def write_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, sort_keys=True)
