# Demo buyer agent

Budget-aware long-context agent that pays per request over x402 on Hedera testnet with no human in the loop (F10, P2).

- OpenAI SDK pointed at the gateway, `fetch` wrapped by `@x402/fetch` with the Hedera exact scheme.
- Sends `X-Headroom-Buyer` and `X-Headroom-Max-Price` (remaining budget) on every call, so the gateway can refuse before quoting.
- Past 80% of the budget it halves output and waits longer; at the cap it stops. A 403 from the gateway also stops it.
- One JSONL line per turn with the Hedera transaction id and HashScan link in `logs/`. Only logs from real testnet runs are committed.

```bash
make demo        # = cd agent && pnpm start, needs AGENT_HEDERA_ID / AGENT_HEDERA_KEY / AGENT_BUDGET_USDC in .env
```
