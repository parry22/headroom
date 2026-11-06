# Benchmark harness

Replays N concurrent agent sessions (PRD 7.3) against configs A, B, C on the same GPU, model and seed.

| File | Role |
| --- | --- |
| `driver.py` | sessions, turns, gaps, per-turn CSV rows, per-session u |
| `scrape.py` | vLLM + LMCache MP metrics every 5 s |
| `report.py` | capacity points, N_C/N_B, N_B/N_A, M1, M6, M7; writes `report.json`, `report.md`, `../latest.json` |
| `correctness.py` | M5: 20 fixed greedy prompts, B vs C after reload |
| `run.sh` | `smoke` or `full` orchestration |
| `prompts/correctness.json` | the 20 fixed prompts (seed + length + question) |
| `results/` | raw CSVs, committed |

Python deps: `httpx` only. `PY` defaults to `uv run --with httpx python3`; install uv on the node with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

Capacity point: largest N with p95 TTFT(hit) ≤ 1.5 s, p95 TTFT(miss) ≤ 6 s and zero errors inside the 4-minute window. Turn 1 of a session is tagged `miss`, turns 2–8 `hit`. u = Σ turn latency ÷ session wall-clock.
