#!/usr/bin/env bash
# Orchestrate a benchmark run on the GPU node.
#   bench/run.sh smoke [RUN_ID]   # B,C ; N=4,16 ; 1 run      (~20 min)
#   bench/run.sh full  [RUN_ID]   # A x1, B x3, C x3 ; N=2..32 (~2.7 h)
# Levels sized for a 24 GB GPU (RTX 4090, FP8 weights ~8.5 GB, ~11 GB KV). Override with LEVELS="...".
set -euo pipefail
MODE=${1:?smoke|full}
RUN_ID=${2:-$(date +%Y%m%d-%H%M)-$MODE}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/bench/results/$RUN_ID"
PY=${PY:-"uv run --with httpx python3"}
set -a; source "$ROOT/.env"; set +a
LMCACHE_HTTP_PORT=${LMCACHE_HTTP_PORT:-8080}
mkdir -p "$OUT"

case "$MODE" in
  smoke) CONFIGS="B C"; LEVELS=${LEVELS:-"4 16"}; RUNS_A=1; RUNS_BC=1; WARM=60 ;;
  full)  CONFIGS="A B C"; LEVELS=${LEVELS:-"2 4 8 16 24 32"}; RUNS_A=1; RUNS_BC=3; WARM=90 ;;
  *) echo "mode must be smoke|full" >&2; exit 2 ;;
esac
SETTLE=${SETTLE:-45}; DURATION=${DURATION:-180}

cd "$ROOT/bench"
echo "run_id=$RUN_ID mode=$MODE configs=[$CONFIGS] levels=[$LEVELS] out=$OUT" | tee "$OUT/run.log"
for CFG in $CONFIGS; do
  RUNS=$RUNS_BC; [ "$CFG" = A ] && RUNS=$RUNS_A
  for R in $(seq 1 "$RUNS"); do
    echo "$(date +%T) start node $CFG run r$R" | tee -a "$OUT/run.log"
    "$ROOT/infra/run-node.sh" "$CFG" | tee -a "$OUT/run.log"
    "$ROOT/infra/engine-info.sh" > "$OUT/engine-$CFG.json"
    # warm-up, excluded from results
    $PY driver.py --config "$CFG" --level 4 --settle 0 --duration "$WARM" --grace 30 --out "$OUT/tmp" --run-id warm >/dev/null || true
    for N in $LEVELS; do
      if [ "$CFG" = C ]; then curl -fs -X POST "http://localhost:$LMCACHE_HTTP_PORT/clear-cache" >/dev/null || true; fi
      TAG="$CFG:$N:r$R"
      $PY scrape.py --out "$OUT/metrics.csv" --tag "$TAG" & SP=$!
      echo "$(date +%T) level $TAG" | tee -a "$OUT/run.log"
      $PY driver.py --config "$CFG" --level "$N" --settle "$SETTLE" --duration "$DURATION" --out "$OUT" --run-id "r$R" | tee -a "$OUT/run.log"
      kill "$SP" 2>/dev/null || true; wait "$SP" 2>/dev/null || true
      if [ "$CFG" = C ] && [ -n "${LMCACHE_L2_PATH:-}" ]; then
        FREE=$(df -BG --output=avail "$LMCACHE_L2_PATH" | tail -1 | tr -dc 0-9)
        echo "$(date +%T) nvme free ${FREE}G" | tee -a "$OUT/run.log"
        if [ "${FREE:-999}" -lt 150 ]; then
          echo "$(date +%T) nvme low, restarting node to drop L2" | tee -a "$OUT/run.log"
          "$ROOT/infra/stop-node.sh"; find "${LMCACHE_L2_PATH:?}" -mindepth 1 -delete; "$ROOT/infra/run-node.sh" C | tee -a "$OUT/run.log"
        fi
      fi
    done
  done
done
find "${OUT:?}/tmp" -mindepth 0 -delete 2>/dev/null || true
$PY report.py --dir "$OUT" | tee -a "$OUT/run.log"
"$ROOT/infra/stop-node.sh"
echo "done: $OUT/report.md"
