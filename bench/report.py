#!/usr/bin/env python3
"""Compute capacity points, gains, u, M1/M6 evidence from a results directory.
Usage: python3 bench/report.py --dir bench/results/<run> [--ttft-hit-ms 1500 --ttft-miss-ms 6000]
Writes report.json and report.md in the directory and copies report.json to bench/results/latest.json.
"""
from __future__ import annotations
import argparse, csv, glob, json, os, statistics
from collections import defaultdict
from common import write_json

def pct(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    k = max(0, min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1)))))
    return xs[k]

def load_csv(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return list(csv.DictReader(f))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--ttft-hit-ms", type=float, default=1500)
    ap.add_argument("--ttft-miss-ms", type=float, default=6000)
    ap.add_argument("--session-tokens", type=int, default=36864, help="prefix + final private context")
    ap.add_argument("--layers", type=int, default=32)
    ap.add_argument("--kv-heads", type=int, default=8)
    ap.add_argument("--head-dim", type=int, default=128)
    ap.add_argument("--l1-gb", type=float, default=float(os.environ.get("LMCACHE_L1_GB", "0") or 0))
    a = ap.parse_args()

    turns = load_csv(os.path.join(a.dir, "turns.csv"))
    sessions = load_csv(os.path.join(a.dir, "sessions.csv"))
    metrics = load_csv(os.path.join(a.dir, "metrics.csv"))

    levels = defaultdict(list)
    for r in turns:
        if r.get("in_window") == "1":
            levels[(r["config"], r["run_id"], int(r["level"]))].append(r)
    sess = defaultdict(list)
    for s in sessions:
        sess[(s["config"], s["run_id"], int(s["level"]))].append(float(s["u"]))
    mrows = defaultdict(list)
    for m in metrics:
        mrows[m["tag"]].append(m)

    def delta(rows, col):
        vals = [float(r[col]) for r in rows if r.get(col) not in (None, "", "None")]
        return (vals[-1] - vals[0]) if len(vals) >= 2 else None

    def vmax(rows, col):
        vals = [float(r[col]) for r in rows if r.get(col) not in (None, "", "None")]
        return max(vals) if vals else None

    level_rows = []
    for (cfg, run, n), rows in sorted(levels.items()):
        ok = [r for r in rows if not r["error"]]
        err = len(rows) - len(ok)
        hit = [float(r["ttft_ms"]) for r in ok if r["hit_tag"] == "hit"]
        miss = [float(r["ttft_ms"]) for r in ok if r["hit_tag"] == "miss"]
        toks = sum(int(r["prompt_tokens"] or 0) + int(r["completion_tokens"] or 0) for r in ok)
        cached = sum(int(r["cached_tokens"] or 0) for r in ok)
        prompt = sum(int(r["prompt_tokens"] or 0) for r in ok)
        ts = [float(r["t_send"]) for r in ok]
        span = (max(ts) - min(ts)) if len(ts) > 1 else None
        us = sess.get((cfg, run, n), [])
        tag = f"{cfg}:{n}:{run}"
        mr = mrows.get(tag, [])
        p95h, p95m = pct(hit, 95), pct(miss, 95)
        passed = err == 0 and p95h is not None and p95m is not None and p95h <= a.ttft_hit_ms and p95m <= a.ttft_miss_ms
        level_rows.append({
            "config": cfg, "run": run, "level": n, "turns": len(rows), "errors": err,
            "ttft_p50_hit_ms": pct(hit, 50), "ttft_p95_hit_ms": p95h, "ttft_p95_miss_ms": p95m,
            "tokens_per_s": (toks / span) if span else None,
            "kv_reuse_rate": (cached / prompt) if prompt else None,
            "u_mean": statistics.fmean(us) if us else None, "u_p50": statistics.median(us) if us else None,
            "l1_hits_delta": delta(mr, "lmcache_lookup_hit_l1"), "l2_hits_delta": delta(mr, "lmcache_lookup_hit_l2"),
            "external_prefix_hits_delta": delta(mr, "vllm_external_prefix_cache_hits"),
            "preemptions_delta": delta(mr, "vllm_num_preemptions"), "kv_usage_max": vmax(mr, "vllm_kv_cache_usage_perc"),
            "pass": passed,
        })

    cap = defaultdict(dict)
    for lr in level_rows:
        if lr["pass"]:
            cap[lr["config"]][lr["run"]] = max(cap[lr["config"]].get(lr["run"], 0), lr["level"])
        else:
            cap[lr["config"]].setdefault(lr["run"], 0)
    capacity = {cfg: statistics.median(runs.values()) if runs else None for cfg, runs in cap.items()}
    def ratio(x, y):
        return (x / y) if x and y else None
    gains = {"n_c_over_n_b": ratio(capacity.get("C"), capacity.get("B")),
             "n_b_over_n_a": ratio(capacity.get("B"), capacity.get("A")),
             "runs_per_config": {cfg: len(runs) for cfg, runs in cap.items()}}

    m6 = {}
    for path in glob.glob(os.path.join(a.dir, "engine-*.json")):
        cfg = os.path.basename(path)[7:-5]
        e = json.load(open(path))
        b = 1 if cfg in ("B", "C") else 2
        formula = 2 * a.layers * a.kv_heads * a.head_dim * b
        measured = (e["kv_cache_gib"] * 2**30 / e["kv_cache_tokens"]) if e.get("kv_cache_gib") and e.get("kv_cache_tokens") else None
        m6[cfg] = {"formula_bytes": formula, "measured_bytes": measured,
                   "delta_pct": ((measured - formula) / formula * 100) if measured else None,
                   "kv_cache_tokens": e.get("kv_cache_tokens"), "vllm_version": e.get("vllm_version"),
                   "lmcache_version": e.get("lmcache_version")}

    m7 = {}
    if "C" in m6 and m6["C"]["kv_cache_tokens"] and capacity.get("C"):
        s_hbm = m6["C"]["kv_cache_tokens"] / a.session_tokens
        bpt = m6["C"]["measured_bytes"] or m6["C"]["formula_bytes"]
        s_dram = (a.l1_gb * 1e9) / (a.session_tokens * bpt) if a.l1_gb else None
        us = [lr["u_mean"] for lr in level_rows if lr["config"] == "C" and lr["level"] == capacity["C"] and lr["u_mean"]]
        u = statistics.fmean(us) if us else None
        n_formula = min(s_hbm / u, s_hbm + s_dram) if (u and s_dram) else (s_hbm / u if u else None)
        m7 = {"s_hbm_sessions": s_hbm, "s_dram_sessions": s_dram, "u_at_capacity": u,
              "n_max_formula": n_formula, "n_c_measured": capacity["C"]}

    m1 = {"c_levels_with_l1_and_l2_hits": [lr["level"] for lr in level_rows if lr["config"] == "C"
                                           and (lr["l1_hits_delta"] or 0) > 0 and (lr["l2_hits_delta"] or 0) > 0],
          "c_kv_usage_max_by_level": {lr["level"]: lr["kv_usage_max"] for lr in level_rows if lr["config"] == "C"}}

    report = {"dir": a.dir, "bars": {"ttft_hit_ms": a.ttft_hit_ms, "ttft_miss_ms": a.ttft_miss_ms},
              "capacity": capacity, "gains": gains, "levels": level_rows, "m1": m1, "m6": m6, "m7": m7}
    write_json(os.path.join(a.dir, "report.json"), report)
    write_json(os.path.join(os.path.dirname(a.dir.rstrip("/")), "latest.json"), report)

    lines = [f"# Bench report: {os.path.basename(a.dir.rstrip('/'))}", "",
             f"Capacity (median over runs): {json.dumps(capacity)}",
             f"Gains: N_C/N_B = {gains['n_c_over_n_b']}, N_B/N_A = {gains['n_b_over_n_a']}, runs = {gains['runs_per_config']}", "",
             "| config | run | N | turns | err | p95 TTFT hit ms | p95 TTFT miss ms | tok/s | reuse | u_mean | L1 hits Δ | L2 hits Δ | preempt Δ | KV max % | pass |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    def f(x, d=1):
        return "" if x is None else (f"{x:.{d}f}" if isinstance(x, float) else str(x))
    for lr in level_rows:
        lines.append(f"| {lr['config']} | {lr['run']} | {lr['level']} | {lr['turns']} | {lr['errors']} | {f(lr['ttft_p95_hit_ms'])} | {f(lr['ttft_p95_miss_ms'])} | {f(lr['tokens_per_s'])} | {f(lr['kv_reuse_rate'],3)} | {f(lr['u_mean'],3)} | {f(lr['l1_hits_delta'],0)} | {f(lr['l2_hits_delta'],0)} | {f(lr['preemptions_delta'],0)} | {f(lr['kv_usage_max'],3)} | {'PASS' if lr['pass'] else 'fail'} |")
    lines += ["", f"M6: {json.dumps(m6)}", "", f"M7: {json.dumps(m7)}", "", f"M1: {json.dumps(m1)}"]
    with open(os.path.join(a.dir, "report.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print("\n".join(lines[:4]))

if __name__ == "__main__":
    main()
