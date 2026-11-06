import type { LedgerData } from "@/lib/ledger";
import { buyerLink, env, links } from "@/lib/env";
import { fmtInt, fmtTs, fmtUsdc, short } from "@/lib/fmt";
import { Num, NoData, Tag } from "./Num";

export function PaidSection({ ledger }: { ledger: LedgerData | null }) {
  const api = links.ledgerSummary;
  return (
    <section id="paid">
      <h2>Live paid calls {ledger?.fixture && <Tag kind="warn">sample fixture</Tag>}</h2>
      <p className="muted">
        Mode A pays per request over the HTTP payment protocol on Hedera testnet, each receipt anchored on HCS. Mode B runs a tab settled in batches on Arc.
        Counts come from the gateway ledger; the <a href={api}>ledger summary JSON</a> shows the SQL behind every figure.
      </p>
      {!ledger ? (
        <NoData />
      ) : (
        <>
          <div className="cards">
            <div className="card"><div className="k">paid requests</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.paid_requests)} /></div></div>
            <div className="card"><div className="k">mode A (Hedera)</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.paid_requests_mode_a)} /></div></div>
            <div className="card"><div className="k">mode B (Arc tab)</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.paid_requests_mode_b)} /></div></div>
            <div className="card"><div className="k">tokens served</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.tokens_served)} /></div></div>
            <div className="card"><div className="k">cached prompt tokens</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.cached_tokens)} /></div></div>
            <div className="card"><div className="k">latest record</div><div className="v small"><Num href={api} value={fmtTs(ledger.summary.latest_record_at)} /></div></div>
          </div>

          <h3>Receipts, newest first</h3>
          {!ledger.receipts.length ? (
            <NoData />
          ) : (
            <div className="scroll">
              <table className="dense">
                <thead>
                  <tr><th>time</th><th>mode</th><th>buyer</th><th>prompt</th><th>cached</th><th>completion</th><th>price USDC</th><th>Hedera tx</th><th>HCS seq</th><th>batch</th><th>status</th></tr>
                </thead>
                <tbody>
                  {ledger.receipts.map((r) => {
                    const rec = links.record(r.request_id);
                    const priceHref = r.mode === "A" && r.payment_tx ? links.hashscanTx(r.payment_tx) : rec;
                    return (
                      <tr key={r.request_id}>
                        <td><Num href={rec} value={fmtTs(r.created_at)} /></td>
                        <td>{r.mode}</td>
                        <td><Num href={buyerLink(r.buyer)} value={short(r.buyer)} title={r.buyer} /></td>
                        <td><Num href={rec} value={fmtInt(r.prompt_tokens)} /></td>
                        <td><Num href={rec} value={fmtInt(r.cached_tokens)} /></td>
                        <td><Num href={rec} value={fmtInt(r.completion_tokens)} /></td>
                        <td><Num href={priceHref} value={fmtUsdc(r.price)} /></td>
                        <td>{r.payment_tx ? <Num href={links.hashscanTx(r.payment_tx)} value={short(r.payment_tx, 12, 8)} title={r.payment_tx} /> : <span className="muted">tab</span>}</td>
                        <td>{r.hcs_seq == null ? <span className="muted">none</span> : <Num href={env.hcsTopicId ? links.hashscanTopic(env.hcsTopicId) : rec} value={fmtInt(r.hcs_seq)} />}</td>
                        <td>{r.batch_id ? <Num href={links.batch(r.batch_id)} value={short(r.batch_id, 10, 4)} title={r.batch_id} /> : <span className="muted">none</span>}</td>
                        <td>{r.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
