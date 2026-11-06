#!/usr/bin/env bash
# make correctness: B outputs vs C outputs after store, evict, reload. Exit 0 iff identical.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PY=${PY:-"uv run --with httpx python3"}
OUT="$ROOT/bench/results/correctness"
mkdir -p "$OUT"
cd "$ROOT/bench"
"$ROOT/infra/run-node.sh" B >/dev/null
$PY correctness.py run --config B --out "$OUT/B.json"
"$ROOT/infra/run-node.sh" C >/dev/null
$PY correctness.py run --config C --out "$OUT/C.json" --fillers "${FILLERS:-80}"
"$ROOT/infra/stop-node.sh" >/dev/null
$PY correctness.py compare --b "$OUT/B.json" --c "$OUT/C.json" --diff "$OUT/latest.diff"
