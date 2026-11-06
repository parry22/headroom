# Bench report: 20261106-1609-full-partial

Capacity (median over runs): {"A": 0, "B": 4}
Gains: N_C/N_B = None, N_B/N_A = None, runs = {'A': 1, 'B': 1}

| config | run | N | turns | err | p95 TTFT hit ms | p95 TTFT miss ms | tok/s | reuse | u_mean | L1 hits Δ | L2 hits Δ | preempt Δ | KV max % | pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | r1 | 4 | 33 | 0 | 5167.0 | 7877.8 | 4959.4 | 0.677 | 0.316 |  |  | 0 | 0.840 | fail |
| A | r1 | 6 | 37 | 0 | 16085.7 | 7010.4 | 5910.3 | 0.303 | 0.449 |  |  | 0 | 0.936 | fail |
| A | r1 | 8 | 40 | 0 | 19526.8 | 20100.1 | 6339.1 | 0.206 | 0.536 |  |  | 1 | 0.969 | fail |
| A | r1 | 10 | 45 | 0 | 27839.8 |  | 6796.0 | 0.188 | 0.583 |  |  | 0 | 0.975 | fail |
| A | r1 | 12 | 51 | 0 | 33624.0 | 922.4 | 7279.5 | 0.176 | 0.634 |  |  | 0 | 0.977 | fail |
| A | r1 | 16 | 61 | 0 | 50542.0 | 9478.6 | 8152.8 | 0.181 | 0.657 |  |  | 1 | 0.978 | fail |
| B | r1 | 4 | 38 | 0 | 919.4 | 836.1 | 5423.2 | 0.840 | 0.243 |  |  | 0 | 0.452 | PASS |
| B | r1 | 6 | 9514 | 9470 | 815.2 | 4830.1 | 5310.1 | 0.799 | 0.283 | 10506752 | 849152 | 0 | 0.987 | fail |

M6: {"B": {"formula_bytes": 65536, "measured_bytes": 65520.15516453997, "delta_pct": -0.02417730020146669, "kv_cache_tokens": 190592, "vllm_version": "0.31.0", "lmcache_version": "0.5.6"}, "A": {"formula_bytes": 131072, "measured_bytes": 131027.86947020961, "delta_pct": -0.033668922264395995, "kv_cache_tokens": 96944, "vllm_version": "0.31.0", "lmcache_version": "0.5.6"}}

M7: {}

M1: {"c_levels_with_l1_and_l2_hits": [], "c_kv_usage_max_by_level": {}}
