#!/usr/bin/env python3
"""Scrape vLLM and LMCache MP Prometheus metrics every --interval seconds into metrics.csv until killed.
Usage: python3 bench/scrape.py --out bench/results/<run>/metrics.csv --tag C:16:r1
"""
from __future__ import annotations
import argparse, csv, os, signal, sys, time
import httpx
from common import LMCACHE_METRICS, VLLM_METRICS, snapshot

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", required=True, help="config:level:run")
    ap.add_argument("--interval", type=float, default=5)
    a = ap.parse_args()
    fields = ["ts", "tag"] + list(VLLM_METRICS) + list(LMCACHE_METRICS)
    new = not os.path.exists(a.out)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    stop = False
    def _stop(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    with open(a.out, "a", newline="") as f, httpx.Client() as c:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if new:
            w.writeheader()
        while not stop:
            row = snapshot(c)
            row["tag"] = a.tag
            w.writerow(row)
            f.flush()
            time.sleep(a.interval)
    sys.exit(0)

if __name__ == "__main__":
    main()
