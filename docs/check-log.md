# Depth-check log

One line per run of `scripts/depth-check.sh`. Status is set from evidence produced in that run only.

| Time (IST) | Commit | Failing checks | Next action |
| --- | --- | --- | --- |
| 2026-11-06 12:20 (manual, Spike B) | see git log | everything except P1, P5, P6 is unrun (no GPU, no escrow, no CRE login) | P1 Pass: 6 HTS USDC settlements via Blocky402, links in README. P5 Pass: `replay-test: PASS` (reused payment gets 402 `payment_replayed`). P6 Pass on the spike ledger: 6 done records = HCS sequence 6 on `0.0.11335247`. Inference was the local fake vLLM. Next: Spike A on a GPU. |
