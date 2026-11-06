# Headroom make targets. The depth checker (scripts/depth-check.sh) runs the
# first six; `demo` and `settle-demo` are run by a human because they spend testnet funds.
SHELL := /bin/bash
.PHONY: bench bench-smoke correctness audit-prices caps-test replay-test reconcile demo settle-demo help

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | tr '\n' ' '; echo

bench:          ## full run: A x1, B x3, C x3, 7 levels (~4 h)
	@echo "bench: not wired yet (bench/run.sh full)"; exit 1

bench-smoke:    ## B and C, N=16 and 48, 1 run (~25 min)
	@echo "bench-smoke: not wired yet (bench/run.sh smoke)"; exit 1

correctness:    ## 20 greedy prompts, config C output must equal config B
	@echo "correctness: not wired yet"; exit 1

audit-prices:   ## recompute 50 sampled ledger records from token counts
	@echo "audit-prices: not wired yet"; exit 1

caps-test:      ## 3 over-cap requests refused before vLLM is called
	@echo "caps-test: not wired yet"; exit 1

replay-test:    ## reused payment payload is rejected
	@echo "replay-test: not wired yet"; exit 1

reconcile:      ## released + refunded + remaining == deposited, per buyer
	@echo "reconcile: not wired yet"; exit 1

demo:           ## demo buyer agent, 20 unattended paid turns on Hedera testnet
	@echo "demo: not wired yet"; exit 1

settle-demo:    ## Arc tab lifecycle: deposit, batch, challenge, release
	@echo "settle-demo: not wired yet"; exit 1
