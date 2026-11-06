/** Operator relay of the CRE baseline (PRD 6.3 fallback while `cre workflow simulate` uses a MockForwarder that never calls onReport):
 *  parses the simulation log's "consensus baselines: H100=<e6> e6 ... H200=<e6> e6" and "run scheduled at <iso>" lines,
 *  writes setBaseline for both GPU types on Arc, and stores price_snapshot rows labelled with the log hash as cre_run_id.
 *  tsx src/set-baseline.ts --log ../cre/sim-<ts>.log   |   --h100 <e6> --h200 <e6> --ts <unix> --run-id <id> */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ledger } from "../../gateway/src/ledger.js";
import { ESCROW, REPO_ROOT, send, wallet } from "./escrow.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
let h100 = arg("--h100"), h200 = arg("--h200"), ts = arg("--ts"), runId = arg("--run-id");
const logPath = arg("--log");
if (logPath) {
  const log = fs.readFileSync(logPath, "utf8");
  const m = /consensus baselines: H100=(\d+) e6.*?H200=(\d+) e6/.exec(log);
  const t = /run scheduled at (\S+)/.exec(log);
  if (!m) { console.error("no 'consensus baselines' line in log"); process.exit(1); }
  h100 = m[1]; h200 = m[2]; ts = String(Math.floor(new Date(t?.[1] ?? Date.now()).getTime() / 1000));
  runId = runId ?? `cre-sim:${crypto.createHash("sha256").update(log).digest("hex").slice(0, 16)}`;
}
if (!h100 || !h200 || !ts) { console.error("need --log or --h100/--h200/--ts"); process.exit(2); }
const ledger = new Ledger(path.resolve(REPO_ROOT, process.env.LEDGER_PATH ?? "./gateway/ledger.db"));
const out: Record<string, unknown> = { runId, ts };
if (ESCROW && process.env.ARC_OPERATOR_KEY) {
  const op = wallet(process.env.ARC_OPERATOR_KEY);
  out.h100_tx = (await send(op, "setBaseline", ["H100", BigInt(h100), BigInt(ts)])).url;
  out.h200_tx = (await send(op, "setBaseline", ["H200", BigInt(h200), BigInt(ts)])).url;
} else out.note = "ARC_ESCROW_ADDRESS/ARC_OPERATOR_KEY unset: snapshot stored locally only";
ledger.addPriceSnapshot({ ts: Number(ts) * 1000, gpu_type: "H100", usd_per_hr: Number(h100) / 1e6, source: logPath ? "cre-sim-relay" : "manual-relay", cre_run_id: runId });
ledger.addPriceSnapshot({ ts: Number(ts) * 1000, gpu_type: "H200", usd_per_hr: Number(h200) / 1e6, source: logPath ? "cre-sim-relay" : "manual-relay", cre_run_id: runId });
console.log(JSON.stringify({ ...out, h100_usd_per_hr: Number(h100) / 1e6, h200_usd_per_hr: Number(h200) / 1e6 }));
