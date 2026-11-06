#!/usr/bin/env bash
# Stop the inference node started by infra/run-node.sh (Docker containers or plain processes).
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOGDIR=${NODE_LOG_DIR:-$ROOT/infra/logs}
if command -v docker >/dev/null 2>&1; then docker rm -f headroom-vllm headroom-lmcache >/dev/null 2>&1 || true; fi
for f in "$LOGDIR"/vllm.pid "$LOGDIR"/lmcache.pid; do
  [ -f "$f" ] || continue
  pid=$(cat "$f")
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$f"
done
echo "node stopped"
