# Bench report: 20261106-1516-smoke

Capacity (median over runs): {"B": 4, "C": 4}
Gains: N_C/N_B = 1.0, N_B/N_A = None, runs = {'B': 1, 'C': 1}

| config | run | N | turns | err | p95 TTFT hit ms | p95 TTFT miss ms | tok/s | reuse | u_mean | L1 hits Δ | L2 hits Δ | preempt Δ | KV max % | pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B | r1 | 4 | 38 | 0 | 953.8 | 834.6 | 5422.6 | 0.840 | 0.243 |  |  | 0 | 0.452 | PASS |
| B | r1 | 16 | 68 | 0 | 21851.8 | 1284.4 | 9664.4 | 0.261 | 0.615 |  |  | 3 | 0.975 | fail |
| C | r1 | 4 | 38 | 0 | 858.5 | 877.8 | 5402.4 | 0.840 | 0.243 | 1220352 | 2048 | 0 | 0.492 | PASS |
| C | r1 | 16 | 111 | 0 | 5195.4 | 5650.1 | 16523.7 | 0.839 | 0.368 | 3202304 | 75520 | 1 | 1.000 | fail |

M6: {"B": {"formula_bytes": 65536, "measured_bytes": 65520.15516453997, "delta_pct": -0.02417730020146669, "kv_cache_tokens": 190592, "vllm_version": "0.31.0", "lmcache_version": "0.5.6"}, "C": {"formula_bytes": 65536, "measured_bytes": 65520.15516453997, "delta_pct": -0.02417730020146669, "kv_cache_tokens": 190592, "vllm_version": "0.31.0", "lmcache_version": "0.5.6"}}

M7: {"s_hbm_sessions": 5.170138888888889, "s_dram_sessions": 16.56084973729874, "u_at_capacity": 0.2434, "n_max_formula": 21.241326577193465, "n_c_measured": 4}

M1: {"c_levels_with_l1_and_l2_hits": [4, 16], "c_kv_usage_max_by_level": {"4": 0.4915624212912434, "16": 1.0}}
