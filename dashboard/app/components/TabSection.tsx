import type { LedgerData } from "@/lib/ledger";
import { buyerLink, env, links } from "@/lib/env";
import { fmtInt, fmtTs, fmtUsdc, short } from "@/lib/fmt";
import { Num, NoData, Tag } from "./Num";

export function TabSection({ ledger }: { ledger: LedgerData | null }) {
  const api = links.ledgerSummary;
  return (
    <section id="tab">
      <h2>Tab on Arc {ledger?.fixture && <Tag kind="warn">sample fixture</Tag>}</h2>
      <p className="muted">
        Tab buyers deposit USDC into the savings-share escrow on Arc testnet. The gateway posts a Merkle root per batch; the escrow releases the
        operator share and refunds the rest.{" "}
        {env.arcEscrowAddress ? <a href={links.arcAddress(env.arcEscrowAddress)}>escrow contract</a> : <span className="muted">escrow address not configured</span>}
        {" · "}
        <a href={`${env.repoUrl}/blob/main/contracts/src/HeadroomEscrow.sol`}>contract source</a>
      </p>
      {!ledger ? (
        <NoData />
      ) : (
        <>
          <div className="cards">
            <div className="card"><div className="k">batches</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.batches)} /></div></div>
            <div className="card"><div className="k">batches posted on Arc</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.batches_posted)} /></div></div>
          </div>
          {!ledger.batches.length ? (
            <NoData />
          ) : (
            <div className="scroll">
              <table className="dense">
                <thead>
                  <tr><th>batch</th><th>buyer</th><th>records</th><th>tokens</th><th>amount USDC</th><th>baseline USDC</th><th>merkle root</th><th>Arc tx</th><th>window ends</th><th>status</th><th>created</th></tr>
                </thead>
                <tbody>
                  {ledger.batches.map((b) => {
                    const ev = links.batch(b.batch_id);
                    const tx = b.post_tx ? links.arcTx(b.post_tx) : ev;
                    return (
                      <tr key={b.batch_id}>
                        <td><Num href={ev} value={short(b.batch_id, 12, 4)} title={b.batch_id} /></td>
                        <td><Num href={buyerLink(b.buyer)} value={short(b.buyer)} title={b.buyer} /></td>
                        <td><Num href={ev} value={fmtInt(b.record_count)} /></td>
                        <td><Num href={ev} value={fmtInt(b.tokens)} /></td>
                        <td><Num href={tx} value={fmtUsdc(b.amount)} /></td>
                        <td><Num href={ev} value={fmtUsdc(b.baseline_amount)} /></td>
                        <td><Num href={tx} value={short(b.merkle_root, 10, 6)} title={b.merkle_root} /></td>
                        <td>{b.post_tx ? <Num href={links.arcTx(b.post_tx)} value={short(b.post_tx, 10, 6)} title={b.post_tx} /> : <span className="muted">not posted</span>}</td>
                        <td><Num href={ev} value={fmtTs(b.window_ends)} /></td>
                        <td>{b.status}</td>
                        <td><Num href={ev} value={fmtTs(b.created_at)} /></td>
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
