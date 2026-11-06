#!/usr/bin/env bash
# Harness self-test against the fake node (unit test; the demo path never uses fakes).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PY=${PY:-"uv run --with httpx python3"}
OUT=$(mktemp -d)
cd "$ROOT/bench"
$PY tests/fake_node.py --port 18000 --lm-port 18080 >"$OUT/fake.log" 2>&1 & FAKE=$!
trap 'kill $FAKE 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs -m 1 http://127.0.0.1:18000/health >/dev/null 2>&1 && break; sleep 1; done
curl -fs -m 2 http://127.0.0.1:18000/health >/dev/null || { echo "fake node did not start"; cat "$OUT/fake.log"; exit 1; }
export VLLM_URL=http://127.0.0.1:18000 LMCACHE_METRICS_URL=http://127.0.0.1:18080/metrics
for CFG in B C; do
  echo '{"kv_cache_gib":50.0,"kv_cache_tokens":819200,"vllm_version":"fake","lmcache_version":"fake"}' > "$OUT/engine-$CFG.json"
  $PY scrape.py --out "$OUT/metrics.csv" --tag "$CFG:2:r1" --interval 0.5 >/dev/null 2>&1 & SP=$!
  $PY driver.py --config "$CFG" --level 2 --settle 1 --duration 4 --grace 3 --out "$OUT" --run-id r1 \
     --prefix-tokens 200 --ctx-start 300 --ctx-end 600 --turns 3 --out-tokens 8 --gap-min 0.1 --gap-max 0.3
  kill $SP 2>/dev/null || true; wait $SP 2>/dev/null || true
done
LMCACHE_L1_GB=200 $PY report.py --dir "$OUT" --session-tokens 800
test -s "$OUT/turns.csv" && test -s "$OUT/sessions.csv" && test -s "$OUT/report.json"
$PY -c "import json; r=json.load(open('$OUT/report.json')); assert r['capacity']['B']==2 and r['capacity']['C']==2, r['capacity']; assert r['m1']['c_levels_with_l1_and_l2_hits']==[2], r['m1']; assert abs(r['m6']['C']['delta_pct'])<1, r['m6']; print('harness self-test OK', r['gains'])"
rm -rf "${OUT:?}"
