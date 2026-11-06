/** HCS audit log (F6): one compact message per paid request, submitted asynchronously with retries. */
import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction, TopicId } from "@hiero-ledger/sdk";
import { cfg } from "./config.js";
import type { Ledger } from "./ledger.js";

export interface AuditMsg { r: string; b: string; p: number; c: number; o: number; q: number; tx: string; t: number; m: "A" | "B" }

export class HcsLog {
  private client: Client | null = null;
  private queue: AuditMsg[] = [];
  private draining = false;
  constructor(private ledger: Ledger) {
    if (cfg.hcsTopicId && cfg.hederaOperatorId && cfg.hederaOperatorKey) {
      this.client = (cfg.hederaNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet())
        .setOperator(AccountId.fromString(cfg.hederaOperatorId), PrivateKey.fromStringECDSA(cfg.hederaOperatorKey));
    }
  }
  enabled(): boolean { return this.client !== null; }
  enqueue(m: AuditMsg): void { if (!this.client) return; this.queue.push(m); void this.drain(); }
  private async drain(): Promise<void> {
    if (this.draining || !this.client) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const m = this.queue[0];
        try {
          const resp = await new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString(cfg.hcsTopicId))
            .setMessage(JSON.stringify(m)).execute(this.client);
          const receipt = await resp.getReceipt(this.client);
          const seq = receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber.toString()) : null;
          this.ledger.update(m.r, { hcs_seq: seq });
          this.queue.shift();
        } catch (e) {
          console.warn("hcs submit failed, retrying in 5s:", (e as Error).message);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    } finally { this.draining = false; }
  }
  pending(): number { return this.queue.length; }
  /** Re-queue finished records that never got an HCS sequence number (gateway restarted with messages in memory),
   *  so the topic count keeps matching the paid count (P6). Call once at startup, before serving. */
  backfill(): number {
    if (!this.client) return 0;
    const rows = this.ledger.db.prepare(`SELECT request_id,mode,buyer,prompt_tokens,cached_tokens,completion_tokens,price,payment_tx,created_at,receipt
      FROM usage_record WHERE status='done' AND hcs_seq IS NULL ORDER BY created_at`).all() as any[];
    for (const r of rows) {
      let t = Math.floor(Number(r.created_at) / 1000);
      try { if (r.receipt) t = Number(JSON.parse(Buffer.from(r.receipt, "base64").toString()).timestamp); } catch { /* keep created_at */ }
      this.queue.push({ r: r.request_id, b: r.buyer, p: Number(r.prompt_tokens), c: Number(r.cached_tokens ?? 0), o: Number(r.completion_tokens ?? 0),
        q: Number(r.price), tx: r.payment_tx ?? "tab", t, m: r.mode === "B" ? "B" : "A" });
    }
    if (rows.length) void this.drain();
    return rows.length;
  }
  /** Finished records still lacking a topic sequence number (queued, in flight, or lost before a restart). */
  unsent(): number {
    return Number((this.ledger.db.prepare(`SELECT COUNT(*) c FROM usage_record WHERE status='done' AND hcs_seq IS NULL`).get() as any).c);
  }
  /** Wait until the queue is empty or the timeout passes; returns how many messages are still unsent. */
  async flush(timeoutMs = 20_000): Promise<number> {
    const end = Date.now() + timeoutMs;
    while (this.queue.length && Date.now() < end) await new Promise(r => setTimeout(r, 250));
    return this.queue.length;
  }
}

/** Publish one Chainlink CRE baseline snapshot to its own HCS topic (kept apart from the paid-request topic so P6 counts stay exact).
 *  Returns the topic sequence number and a HashScan link, or null when the topic or operator is not configured. */
export async function publishBaseline(msg: { k: "baseline"; gpu: string; e6: string; ts: number; run: string; src: string; arc_tx?: string }): Promise<{ seq: number; url: string } | null> {
  if (!cfg.hcsBaselineTopicId || !cfg.hederaOperatorId || !cfg.hederaOperatorKey) return null;
  const client = (cfg.hederaNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet())
    .setOperator(AccountId.fromString(cfg.hederaOperatorId), PrivateKey.fromStringECDSA(cfg.hederaOperatorKey));
  try {
    const resp = await new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString(cfg.hcsBaselineTopicId)).setMessage(JSON.stringify(msg)).execute(client);
    const seq = Number((await resp.getReceipt(client)).topicSequenceNumber?.toString() ?? 0);
    return { seq, url: `https://hashscan.io/${cfg.hederaNetwork}/topic/${cfg.hcsBaselineTopicId}/message/${seq}` };
  } finally { client.close(); }
}

export async function mirrorTopicCount(topicId: string): Promise<number> {
  const base = cfg.hederaNetwork === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
  const r = await fetch(`${base}/api/v1/topics/${topicId}/messages?order=desc&limit=1`);
  const j: any = await r.json();
  return j.messages?.[0]?.sequence_number ?? 0;
}
