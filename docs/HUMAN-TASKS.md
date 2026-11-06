# Human-owned tasks (do these now, in this order)

Each unblocks a spike. Agent work continues in parallel on gateway, bench, signer, CRE.

| # | Task | Unblocks | Done when |
| --- | --- | --- | --- |
| 1 | Book the GPU: 1x H100 80 GB (or L40S 48 GB), host RAM ≥ 256 GB, local NVMe ≥ 1 TB, Docker + NVIDIA runtime. Note $/hr into `.env` as `GPU_USD_PER_HR`. | Spike A, G1 | `nvidia-smi` and `free -g` output pasted to me |
| 2 | Accept the Llama 3.1 license at huggingface.co/meta-llama/Llama-3.1-8B-Instruct; create an HF token; put it in `.env` on the node as `HF_TOKEN`. | Spike A | token works: `huggingface-cli whoami` |
| 3 | On the node: `git clone <repo>`, `cp .env.example .env`, fill `LMCACHE_L1_GB` (80% of host RAM), `LMCACHE_L2_PATH` on the NVMe, then `infra/run-node.sh C && python3 infra/tierhit_smoke.py --fillers 80`. Paste the `RESULT` line and `infra/engine-info.sh` output. | M1, M5 | `RESULT ... PASS` |
| 4 | Hedera testnet: create an ECDSA account at portal.hedera.com (100 HBAR/day faucet). Associate USDC `0.0.429274`, get test USDC at faucet.circle.com (Hedera Testnet). Create a second account for the demo agent. Put IDs and keys in `.env` (`HEDERA_OPERATOR_*`, `AGENT_HEDERA_*`). | Spike B, P1 | both accounts show USDC on hashscan.io/testnet |
| 5 | Arc Studio: sign in at studio.arc.io, Smart Contract mode, deploy the v0 contract from `contracts/STUDIO-PROMPT.md` (written by the agent) to Arc testnet. Find the shareable project URL and test it logged out. Put the address in `.env` as `ARC_ESCROW_ADDRESS` and the URL as `ARC_STUDIO_PROJECT_URL`. Get Arc testnet USDC at faucet.circle.com (20 USDC / 2 h). | Spike C, S1 | address on explorer.testnet.arc.io; URL opens logged out |
| 6 | Chainlink CRE: `curl -sSL https://app.chain.link/cre/install.sh \| bash`, then `cre login` (browser). Then `cd cre && cre workflow simulate price-baseline --target staging-settings`. Paste the output. | Spike D, D1 | log shows cron trigger, HTTP fetch, median, dry-run write |
| 7 | Commit cadence: review and commit every ≤ 2 h in your own name (E2). Keep `docs/check-log.md` honest. | E2 | no gap > 3 h in `git log` |

Secrets live only in `.env`. Never paste a private key into chat; paste account IDs, addresses and transaction links instead.
