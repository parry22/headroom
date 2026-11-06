# Fresh Chainlink CRE baseline before judging (one command: `make fresh-baseline`; `make` broken on this Mac, so run the two lines below by hand)

1. `cd cre && cre workflow simulate price-baseline --target staging-settings 2>&1 | tee sim-$(date +%s).log` — 16 s measured (2026-11-06 21:00 IST); log must contain `consensus baselines: H100=... e6 ... H200=... e6`.
2. `cd signer && node_modules/.bin/tsx src/set-baseline.ts --log ../cre/sim-<ts>.log` — 9 s measured; prints JSON with run id, two Arc tx links (`setBaseline` H100/H200 on escrow `0xfa7b11252defd7ce61d271f2cbfc8eab7a5acb6f`) and two HCS sequence numbers on topic `0.0.11339845`.
3. Depth check D1 fails when the on-chain baseline timestamp is older than 1 h, so re-run both steps within 1 h before the demo/judging (judging starts 09:30 IST Sat 7 Nov; run at about 09:00 IST, right after the 09:00 submission deadline).
4. The sim stamps the next 15-min cron slot (`run scheduled at ...`) and the escrow rejects a timestamp that does not increase, so run at most once per quarter hour; if the relay reverts, wait for the next slot and run again. Last good run: `cre-sim:d30963846d8af2f9`, ts 1793979000 (21:00 IST), HCS seq 3 and 4.
