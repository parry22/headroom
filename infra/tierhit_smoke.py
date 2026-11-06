#!/usr/bin/env python3
"""Spike A step 5-6: prove DRAM (L1) and NVMe (L2) tier hits and bit-exact reload on config C.

Sends 3 long prompts sharing a 4K prefix, then enough filler prompts to evict them from
GPU KV and from L1, then the first 3 again. Prints tier metrics and output equality.
Stdlib only. Usage: VLLM_URL=http://localhost:8000 LMCACHE_METRICS_URL=http://localhost:8080/metrics \
  python3 infra/tierhit_smoke.py --fillers 80
"""
import argparse, json, os, random, re, sys, time, urllib.request

VLLM = os.environ.get("VLLM_URL", "http://localhost:8000")
LMM = os.environ.get("LMCACHE_METRICS_URL", "http://localhost:8080/metrics")
MODEL = os.environ.get("MODEL", "meta-llama/Llama-3.1-8B-Instruct")
WORDS = ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho "
         "sigma tau upsilon phi chi psi omega ledger kernel memory tensor cache token agent tool").split()

def text(rng, words):
    return " ".join(rng.choice(WORDS) for _ in range(words))

def complete(prompt, max_tokens=8):
    body = json.dumps({"model": MODEL, "prompt": prompt, "max_tokens": max_tokens,
                       "temperature": 0, "seed": 1}).encode()
    req = urllib.request.Request(f"{VLLM}/v1/completions", body, {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        out = json.load(r)
    return out["choices"][0]["text"], out.get("usage", {}), time.time() - t0

def metrics(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read().decode()
    except Exception as e:  # noqa: BLE001
        return f"# unavailable: {e}"

def pick(txt, *prefixes):
    tot = {}
    for line in txt.splitlines():
        if line.startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_:][A-Za-z0-9_:]*)(\{[^}]*\})?\s+([-+0-9.eE]+)", line)
        if not m:
            continue
        name, val = m.group(1), float(m.group(3))
        for p in prefixes:
            if name.startswith(p):
                tot[name] = tot.get(name, 0.0) + val
    return tot

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fillers", type=int, default=80, help="filler prompts; each ~16K tokens")
    ap.add_argument("--words", type=int, default=12000, help="private words per prompt (~16K tokens)")
    args = ap.parse_args()
    rng = random.Random(1337)
    prefix = text(rng, 3000)  # ~4K tokens shared prefix
    probes = [prefix + "\n\n" + text(random.Random(i), args.words) + f"\nProbe {i}. Continue:" for i in range(3)]

    print("== first pass (store) ==")
    first = []
    for i, p in enumerate(probes):
        out, usage, dt = complete(p)
        first.append(out)
        print(f"probe{i}: prompt_tokens={usage.get('prompt_tokens')} cached={usage.get('prompt_tokens_details', {}).get('cached_tokens')} {dt:.1f}s")
    m0 = pick(metrics(LMM), "lmcache_mp_lookup_hit", "lmcache_mp_l1_memory_usage", "lmcache_mp_l2_usage")

    print(f"== {args.fillers} fillers (evict GPU KV and L1) ==")
    t0 = time.time()
    for i in range(args.fillers):
        complete(prefix + "\n\n" + text(random.Random(1000 + i), args.words) + "\nFiller. Continue:", 1)
        if i % 10 == 9:
            print(f"  {i+1}/{args.fillers} {time.time()-t0:.0f}s")

    print("== second pass (reload) ==")
    same = True
    for i, p in enumerate(probes):
        out, usage, dt = complete(p)
        eq = out == first[i]
        same &= eq
        print(f"probe{i}: cached={usage.get('prompt_tokens_details', {}).get('cached_tokens')} {dt:.1f}s bit_exact={eq}")
    m1 = pick(metrics(LMM), "lmcache_mp_lookup_hit", "lmcache_mp_l1_memory_usage", "lmcache_mp_l2_usage")
    v = pick(metrics(f"{VLLM}/metrics"), "vllm:external_prefix_cache_hits", "vllm:prefix_cache_hits", "vllm:num_preemptions")

    print("== lmcache deltas ==")
    for k in sorted(set(m0) | set(m1)):
        print(f"{k}: {m0.get(k, 0):.0f} -> {m1.get(k, 0):.0f}")
    print("== vllm ==")
    for k, val in sorted(v.items()):
        print(f"{k}: {val:.0f}")
    l1 = sum(val for k, val in m1.items() if k.startswith("lmcache_mp_lookup_hit_l1") and "keys" not in k)
    l2 = sum(val for k, val in m1.items() if k.startswith("lmcache_mp_lookup_hit_l2") and "keys" not in k)
    ok = l1 > 0 and l2 > 0 and same
    print(f"\nRESULT l1_hits={l1:.0f} l2_hits={l2:.0f} bit_exact={same} -> {'PASS' if ok else 'FAIL'}")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
