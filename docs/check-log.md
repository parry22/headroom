# Depth-check log

One line per run of `scripts/depth-check.sh`. Status is set from evidence produced in that run only.

| Time (IST) | Commit | Failing checks | Next action |
| --- | --- | --- | --- |
| 2026-11-06 11:55 (manual, Spike B; first logged as 12:20, corrected) | see git log | everything except P1, P5, P6 is unrun (no GPU, no escrow, no CRE login) | P1 Pass: 6 HTS USDC settlements via Blocky402, links in README. P5 Pass: `replay-test: PASS` (reused payment gets 402 `payment_replayed`). P6 Pass on the spike ledger: 6 done records = HCS sequence 6 on `0.0.11335247`. Inference was the local fake vLLM. Next: Spike A on a GPU. |
| 2026-11-06 11:56 (status report) | e72de5d | Fail: P2 P3 D1 D2 V1 V2 V3. Not built: M1–M7 (no GPU), S1–S5 (no escrow). Pass: P1 P4 P5 P6 (spike ledger, fake vLLM for P4). Previous row's time is wrong: Spike B ran 11:44–11:55 IST | Human books the GPU and sets HF_TOKEN; then Spike A + bench-smoke |
| 2026-11-06 14:33 (fix pass) | e72de5d+fix | Fail: V1 V2 V3 (0 external wallets). Not built: M1–M7 (no GPU), S1 (no Studio contract), CRE run. Pass: P1–P6 (fake vLLM inference), S2–S5 (reference escrow `0xfa7b…cb6f`), D1 (manual-relay baseline, expires 1 h), D2 (0 unlinked) | Human books GPU + HF_TOKEN; `arc-studio login`; `cre login` |
