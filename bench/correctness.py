#!/usr/bin/env python3
"""M5: 20 fixed greedy prompts. Config C output (after store, evict, reload) must equal config B output on the same
warm path: B runs each prompt twice and its second pass reuses the KV from GPU prefix cache, so both sides decode from
stored KV rather than one side from a cold prefill (vLLM kernels are not batch-shape invariant, so cold vs warm can
differ in late tokens on any config). The report also prints B cold-vs-warm as a control.
  python3 bench/correctness.py run --config B --out bench/results/correctness/B.json
  python3 bench/correctness.py run --config C --out bench/results/correctness/C.json --fillers 80
  python3 bench/correctness.py compare --b bench/results/correctness/B.json --c bench/results/correctness/C.json --diff bench/results/correctness/latest.diff
Prompts are fixed by bench/prompts/correctness.json (seed + token length per prompt).
"""
from __future__ import annotations
import argparse, json, os, sys
import httpx
from common import MODEL, VLLM_URL, calibrate_tokens_per_word, salad, shared_prefix, words_for, write_json

SPEC = os.path.join(os.path.dirname(__file__), "prompts", "correctness.json")

def prompts():
    spec = json.load(open(SPEC))
    with httpx.Client() as c:
        tpw = calibrate_tokens_per_word(c)
    prefix = shared_prefix(words_for(spec["prefix_tokens"], tpw))
    out = []
    for p in spec["prompts"]:
        body = salad(p["seed"], words_for(p["tokens"], tpw)) if p.get("seed") is not None else ""
        out.append((p["id"], prefix + "\n\n" + body + "\n\n" + p["question"]))
    return out, prefix, tpw

def complete(c: httpx.Client, prompt: str, max_tokens: int) -> str:
    r = c.post(f"{VLLM_URL}/v1/completions", json={"model": MODEL, "prompt": prompt, "max_tokens": max_tokens,
                                                   "temperature": 0, "seed": 1}, timeout=600)
    r.raise_for_status()
    return r.json()["choices"][0]["text"]

def run(a):
    ps, prefix, tpw = prompts()
    out = {}
    with httpx.Client() as c:
        for pid, p in ps:            # pass 1: store (and the only pass for B)
            out[pid] = complete(c, p, a.max_tokens)
        if a.config == "B":
            out = {"first_pass": out, "outputs": {pid: complete(c, p, a.max_tokens) for pid, p in ps}}   # warm, GPU prefix cache
        elif a.config == "C":
            for i in range(a.fillers):   # evict from GPU KV and L1
                complete(c, prefix + "\n\n" + salad(900_000 + i, words_for(16384, tpw)) + "\nFiller.", 1)
            out2 = {pid: complete(c, p, a.max_tokens) for pid, p in ps}   # pass 2: reload from L1/L2
            out = {"first_pass": out, "outputs": out2}
    out["config"] = a.config
    write_json(a.out, out)
    print(f"{a.config}: {len(ps)} prompts -> {a.out}")

def mismatches(x: dict, y: dict) -> int:
    return sum(1 for k in x if x[k] != y.get(k))

def compare(a):
    bj, cj = json.load(open(a.b)), json.load(open(a.c))
    b, c = bj["outputs"], cj["outputs"]
    if "first_pass" in bj:
        print(f"control: B cold vs B warm: {mismatches(bj['first_pass'], b)} of {len(b)} differ")
    if "first_pass" in cj:
        print(f"control: C cold vs B cold: {mismatches(cj['first_pass'], bj.get('first_pass', b))} of {len(b)} differ")
    lines = []
    for k in sorted(b):
        if b[k] != c.get(k):
            lines += [f"--- B {k}", b[k], f"+++ C {k}", str(c.get(k)), ""]
    os.makedirs(os.path.dirname(a.diff) or ".", exist_ok=True)
    with open(a.diff, "w") as f:
        f.write("\n".join(lines))
    n = sum(1 for k in b if b[k] != c.get(k))
    print(f"correctness: {len(b)} prompts, {n} mismatches, diff -> {a.diff}")
    sys.exit(1 if n else 0)

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--config", required=True, choices=["B", "C"])
    r.add_argument("--out", required=True)
    r.add_argument("--max-tokens", type=int, default=64)
    r.add_argument("--fillers", type=int, default=80)
    cp = sub.add_parser("compare")
    cp.add_argument("--b", required=True)
    cp.add_argument("--c", required=True)
    cp.add_argument("--diff", required=True)
    a = ap.parse_args()
    run(a) if a.cmd == "run" else compare(a)

if __name__ == "__main__":
    main()
