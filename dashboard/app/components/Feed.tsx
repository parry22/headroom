import type { UsageRow } from "@/lib/ledger";
import { buyerLink, links } from "@/lib/env";
import { fmtInt, fmtTs, fmtUsdc, short } from "@/lib/fmt";
import { Num } from "./Num";
import { Empty } from "./ui";

/** Newest paid calls as a feed: who, how many tokens, what it cost, where it settled. */
export function Feed({ rows }: { rows: UsageRow[] }) {
  if (!rows.length) return <Empty>No paid calls yet. They appear here as soon as the gateway records one.</Empty>;
  return (
    <ul className="feed">
      {rows.map((r) => {
        const rec = links.record(r.request_id);
        return (
          <li key={r.request_id}>
            <span className={r.mode === "A" ? "mode a" : "mode"} title={r.mode === "A" ? "Mode A: paid per request on Hedera" : "Mode B: drawn from a tab on Arc"}>
              {r.mode}
            </span>
            <div className="what">
              <div>
                <Num href={buyerLink(r.buyer)} value={short(r.buyer)} title={r.buyer} />
              </div>
              <div className="line2">
                <span>
                  in <Num href={rec} value={fmtInt(r.prompt_tokens)} />, cached <Num href={rec} value={fmtInt(r.cached_tokens)} />, out{" "}
                  <Num href={rec} value={fmtInt(r.completion_tokens)} />
                </span>
                <Num href={rec} value={fmtTs(r.created_at)} />
              </div>
            </div>
            <div className="price">
              <Num href={r.payment_tx ? links.hashscanTx(r.payment_tx) : rec} value={fmtUsdc(r.price)} />
              <small>
                {r.payment_tx ? (
                  <a className="link" href={links.hashscanTx(r.payment_tx)} target="_blank" rel="noreferrer">
                    USDC on Hedera
                  </a>
                ) : r.batch_id ? (
                  <a className="link" href={links.batch(r.batch_id)} target="_blank" rel="noreferrer">
                    USDC, Arc batch
                  </a>
                ) : (
                  "USDC, open tab"
                )}
              </small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
