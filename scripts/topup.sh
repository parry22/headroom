#!/usr/bin/env bash
# One-line top-up for buyers: associate testnet USDC with a Hedera account and print the faucet links.
# Usage: scripts/topup.sh <hederaAccountId> <ecdsaKeyHex>
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ $# -ge 2 ] || { echo "usage: scripts/topup.sh <hederaAccountId> <ecdsaKeyHex>"; exit 2; }
(cd "$ROOT/gateway" && pnpm -s exec tsx scripts/associate-usdc.ts "$1" "$2")
cat <<MSG
Now get funds:
  HBAR (fees):   https://portal.hedera.com/faucet        (100 HBAR / 24 h)
  USDC testnet:  https://faucet.circle.com  -> Hedera Testnet -> $1   (token 0.0.429274)
Then pay:        curl -s \$GATEWAY/discovery.json   and point an x402 client (e.g. @x402/fetch + @x402/hedera) at /v1/chat/completions
MSG
