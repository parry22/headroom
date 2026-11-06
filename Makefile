# Headroom make targets. The depth checker (scripts/depth-check.sh) runs the
# first six; `demo` and `settle-demo` are run by a human because they spend testnet funds.
SHELL := /bin/bash
PY ?= uv run --with httpx python3
export PY
.PHONY: depth-check escrow-test gateway-test bench-test bench bench-smoke correctness audit-prices caps-test replay-test reconcile fresh-baseline demo settle-demo help

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | tr '\n' ' '; echo

bench:          ## full run: A x1, B x3, C x3, 6 levels N=2..32 (~2.7 h, sized for 24 GB)
	bench/run.sh full

bench-smoke:    ## B and C, N=4 and 16, 1 run (~20 min)
	bench/run.sh smoke

escrow-test:    ## escrow Foundry tests (offline, solc 0.8.28)
	cd contracts && forge test

gateway-test:   ## gateway unit + flow tests against fakes (unit test only)
	cd gateway && pnpm -s test

bench-test:     ## harness self-test against a fake node (unit test only)
	bench/tests/test_harness.sh

correctness:    ## 20 greedy prompts, config C output must equal config B
	bench/correctness.sh

audit-prices:   ## recompute 50 sampled ledger records from token counts
	cd gateway && pnpm -s audit-prices

caps-test:      ## 3 over-cap requests refused before vLLM is called
	cd gateway && pnpm -s caps-test

replay-test:    ## reused payment payload is rejected
	cd gateway && pnpm -s replay-test

reconcile:      ## deposited + penalties == released + withdrawn + free + locked, per buyer, from Arc events
	cd signer && pnpm -s reconcile

fresh-baseline: ## CRE sim + operator relay of the consensus baseline to Arc and HCS (~30 s; re-run <1 h before judging, once per 15-min cron slot)
	set -o pipefail; export PATH=$$HOME/.local/bin:$$PATH; ts=$$(date +%s); \
	cd cre && cre workflow simulate price-baseline --target staging-settings 2>&1 | tee sim-$$ts.log \
	&& grep -q 'consensus baselines:' sim-$$ts.log \
	&& cd ../signer && node_modules/.bin/tsx src/set-baseline.ts --log ../cre/sim-$$ts.log

demo:           ## demo buyer agent, 20 unattended paid turns on Hedera testnet
	cd agent && pnpm -s start

settle-demo:    ## Arc tab lifecycle: deposit, batch, challenge, release (spends testnet USDC)
	cd signer && pnpm -s settle-demo

depth-check:    ## section 8 checker; appends to docs/check-log.md
	scripts/depth-check.sh
