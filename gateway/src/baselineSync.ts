/** Pull the on-chain baseline (set by the CRE forwarder or the operator relay) from the Arc escrow into price_snapshot. */
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { cfg } from "./config.js";
import type { Ledger } from "./ledger.js";

const abi = parseAbi(["function baseline(string gpuType) view returns (uint256 usdPerHourE6, uint256 timestamp)"]);
export function startBaselineSync(ledger: Ledger, onChange: () => void, intervalMs = 60_000): void {
  if (!cfg.arcEscrowAddress) return;
  const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io") });
  const tick = async () => {
    let changed = false;
    for (const gpu of ["H100", "H200"]) {
      try {
        const [e6, ts] = await client.readContract({ address: cfg.arcEscrowAddress as Hex, abi, functionName: "baseline", args: [gpu] }) as [bigint, bigint];
        if (ts === 0n) continue;
        const latest = ledger.latestSnapshot(gpu);
        if (!latest || latest.ts < Number(ts) * 1000) { ledger.addPriceSnapshot({ ts: Number(ts) * 1000, gpu_type: gpu, usd_per_hr: Number(e6) / 1e6, source: `arc:${cfg.arcEscrowAddress}` }); changed = true; }
      } catch (e) { console.warn(`baseline sync ${gpu}:`, (e as Error).message); }
    }
    if (changed) onChange();
  };
  void tick();
  setInterval(() => void tick(), intervalMs);
}
