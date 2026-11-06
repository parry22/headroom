import { cfg } from "./config.js";
import { buildDeps, createApp } from "./app.js";

const deps = buildDeps();
deps.pricing.refresh();
await deps.x402.http.initialize().catch(e => console.warn("facilitator sync at start failed (will retry per request):", (e as Error).message));
const app = createApp(deps);
app.listen(cfg.port, () => {
  console.log(`headroom gateway on :${cfg.port} model=${cfg.model} network=hedera:${cfg.hederaNetwork} facilitator=${cfg.facilitatorUrl} hcs=${deps.hcs.enabled()}`);
});
setInterval(() => { try { deps.pricing.refresh(); } catch (e) { console.warn("pricing refresh:", (e as Error).message); } }, 60_000);
