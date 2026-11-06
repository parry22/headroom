import { cfg } from "./config.js";
import { buildDeps, createApp } from "./app.js";
import { startBaselineSync } from "./baselineSync.js";

const deps = buildDeps();
deps.pricing.refresh();
await deps.x402.http.initialize().catch(e => console.warn("facilitator sync at start failed (will retry per request):", (e as Error).message));
const requeued = deps.hcs.backfill();
if (requeued) console.log(`hcs: re-queued ${requeued} finished records without a topic sequence number`);
const app = createApp(deps);
const server = app.listen(cfg.port, () => {
  console.log(`headroom gateway on :${cfg.port} model=${cfg.model} network=hedera:${cfg.hederaNetwork} facilitator=${cfg.facilitatorUrl} hcs=${deps.hcs.enabled()}`);
});
startBaselineSync(deps.ledger, () => { try { deps.pricing.refresh(); } catch (e) { console.warn("pricing refresh:", (e as Error).message); } });
setInterval(() => { try { deps.pricing.refresh(); } catch (e) { console.warn("pricing refresh:", (e as Error).message); } }, 60_000);

for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, async () => {
  server.close();
  const left = await deps.hcs.flush(20_000);
  if (left) console.warn(`hcs: exiting with ${left} unsent messages; they are re-queued on next start`);
  process.exit(0);
});
