# AI disclosure

Headroom was built at ETHGlobal Mumbai (5 to 7 Nov 2026) by Pravneet Singh with Claude Code (Claude Fable 5.1, later Claude Opus 5.5) as a coding agent.

Claude drafted most of the source files in this repo. The human set the product direction, ran everything that needs a GPU, a wallet or an account, and accepted each gate on evidence. The table below says which files Claude drafted, so the AI-written parts can be told apart from the human's. No project code predates the hackathon start. Public libraries and starter kits are listed in each package manifest and in `infra/VERSIONS.md`.

## Commit attribution

Every AI commit carries a `Co-Authored-By: Claude ...` trailer naming the model. At the time of writing, `git rev-list --count HEAD` gives 22 commits and `git log --format=%b | grep -c Co-Authored-By` gives 22 trailers, so every commit has one. All 22 are authored under the human's git identity (`parry`) and were made on 6 Nov 2026, 09:43 to 19:18 IST.

| Model | Commits | Span |
| --- | --- | --- |
| Claude Fable 5.1 | 13 | `66233f3` (scaffold) to `14c9900` (handoff note) |
| Claude Opus 5.5 | 9 | `9c8d797` (receipts) to `0005872` (node setup) |

Because every commit is both human-authored and AI co-authored, git history cannot split a single file into human and AI lines. The table gives the per-file account.

## What AI drafted

"Fable" is Claude Fable 5.1, "Opus" is Claude Opus 5.5. "First draft" is the model that created the file; "edits" are later commits that changed it.

| Path | What AI produced | What the human did |
| --- | --- | --- |
| `gateway/src/` | x402 gateway on Hedera, pricing formula, spend caps, SQLite ledger, receipts, HCS audit log, tab requests with EIP-712 session keys, on-chain baseline sync. First draft Fable (`c6ae92c`, `491dc26`, `0ed2939`); edits Opus (receipt domain, HCS log, config). | Reviewed, ran against live Hedera testnet, funded and set up the Hedera accounts, accepted checks P1 to P6. |
| `gateway/test/`, `gateway/scripts/` | Unit tests with a fake vLLM, replay and caps tests, price audit, HCS topic creation, Hedera pre-flight, ledger printing. Fable; `print-ledger.ts` and edits Opus. | Ran the scripts that touch the network and read the output. |
| `signer/` | Merkle batch builder, batch poster, reconciliation against Arc events, tab signing client, escrow bindings, settle-demo runner, key generator, escrow deploy script. Fable; `gen-keys.ts`, `deploy-escrow.ts` and edits Opus. | Funded the Arc keys, ran the Arc transactions, accepted S2 to S5. |
| `contracts/src/HeadroomEscrow.sol`, `contracts/test/`, `contracts/ESCROW-SPEC.md`, `contracts/abi/` | Escrow contract, 12 Foundry tests, spec, ABI. Opus. | Decided to make it the submission contract after Arc judges said a CLI deploy qualifies; funded the deployer; accepted S1 on the explorer evidence. |
| `contracts/IHeadroomEscrow.sol` | Escrow interface. Fable; edits Opus. | Reviewed. |
| `cre/` | Chainlink CRE `price-baseline` workflow (`main.ts`, configs, `workflow.yaml`), receiver contract, README. Fable; simulation fixes Opus. | Created the Chainlink account, ran `cre login`, accepted the simulation result. Deploy access is not enabled on the account, so the baseline is relayed by the operator (see README). |
| `bench/` | Replay driver, metrics scraper, report, correctness check, run script, fake node and harness test. Fable; small edits Opus. | Rents the GPU, runs the benchmark, decides which numbers to publish. |
| `agent/` | Budget-aware demo buyer agent paying over x402. Fable. | Funded the buyer account, ran the demo, kept the run logs. |
| `dashboard/` | Next.js dashboard, components, ledger and bench readers, link audit script. Fable; edits Opus (`page.tsx`, `env.ts`, tab and pricing sections). | Reviewed the page against the evidence; decided what the dashboard must show. |
| `infra/` | vLLM and LMCache configs A/B/C, run and stop scripts, tier-hit smoke test, version pins. Fable; Opus rewrote the node setup for a single RTX 4090 without Docker (`0005872`). | Chose and rented the GPU, operated the node, kept the Spike A log. |
| `scripts/` | `depth-check.sh` (acceptance checker), `spike-b.sh`, `topup.sh`. Fable; `spike-b.sh` edits Opus. | Ran them on the node and accepted the results. |
| `README.md`, `docs/architecture.md` | Drafted and kept in sync with the code. Fable; Opus edits. | Reviewed. |
| `Makefile`, `.env.example`, `.gitignore`, `.claude/launch.json` | Scaffold and later edits. Fable first, Opus edits. | Filled in `.env` with real values (not in the repo). |
| `docs/PRD.md` | Sections 5 to 8 (architecture, flows, technical specs, depth bar) drafted by AI; AI also synced the PRD to the built design in later commits. | Wrote the product thesis and chose the pricing model. |
| `docs/HANDOFF.md`, `docs/HUMAN-TASKS.md`, `docs/check-log.md` | Written by the agent sessions as notes and status logs. | Read them, did the tasks, accepted or rejected each row. |

## Planning artifacts and prompts in the repo

- `docs/PRD.md`: product spec. Thesis by the human, sections 5 to 8 drafted by AI.
- `docs/HANDOFF.md`: handoff notes written by an AI session for the next AI session. It records the plan, hard rules, repo state and verified partner facts, and summarises the earlier session.
- `docs/HUMAN-TASKS.md`: checklist of the tasks only the human can do, with status.
- `docs/check-log.md`: one row per run of `scripts/depth-check.sh`, with the next action.
- `contracts/ESCROW-SPEC.md`: spec for the escrow contract, written as a brief and used to build and test it.
- `docs/evidence/`: run logs (CRE simulation output, demo agent runs, reconcile and settle-demo output, the Spike A GPU run).

No separate prompt files exist beyond these. The prompts were interactive Claude Code sessions, and `docs/HANDOFF.md` summarises them. A longer build plan was kept outside the repo as a local Claude Code plan file and is not included.

## What the human did without AI

- Product thesis and the pricing model choice.
- GPU rental and node operation.
- All keys and all testnet funding. Private keys live only in a git-ignored `.env`.
- Hedera, Arc and Chainlink account setup, and `cre login`.
- Acceptance of every gate on evidence, including deciding what counts as a pass.
- The demo video and the submission.

## Limits of this account

This file is written from the repo and its git history. It does not claim that every line the human typed or edited is visible: edits made by hand before a commit are folded into the same commits as the AI drafts.
