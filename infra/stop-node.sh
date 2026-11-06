#!/usr/bin/env bash
docker rm -f headroom-vllm headroom-lmcache >/dev/null 2>&1 || true
echo "node stopped"
