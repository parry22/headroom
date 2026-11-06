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
}

export async function mirrorTopicCount(topicId: string): Promise<number> {
  const base = cfg.hederaNetwork === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
  const r = await fetch(`${base}/api/v1/topics/${topicId}/messages?order=desc&limit=1`);
  const j: any = await r.json();
  return j.messages?.[0]?.sequence_number ?? 0;
}
