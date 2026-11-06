import Link from "next/link";
import type { LedgerData } from "@/lib/ledger";
import { buyerLink, env, links, SNAPSHOT } from "@/lib/env";
import { fmtInt, fmtTs, fmtUsdc, short } from "@/lib/fmt";
import { AutoRefresh } from "./AutoRefresh";
import { Num, Tag } from "./Num";
import { Card, Empty, Evidence, PageHeader, Stat } from "./ui";

export type View = "receipts" | "batches";
export type ModeFilter = "all" | "A" | "B";

export function PaymentsSection({ ledger, view, mode }: { ledger: LedgerData | null; view: View; mode: ModeFilter }) {
  const api = links.ledgerSummary;
  const s = ledger?.summary;
  return (
    <>
      <PageHeader
        eyebrow={ledger?.fixture ? <Tag kind="warn">sample fixture</Tag> : undefined}
        title="Paid calls and settlement"
        actions={SNAPSHOT ? undefined : <AutoRefresh />}
      >
        Two ways to pay for the same inference. Both are recorded in the gateway ledger and both write a receipt to Hedera Consensus Service.
      </PageHeader>

      {!ledger || !s ? (
        <Empty>No ledger yet. Paid calls show up here as soon as the gateway records one.</Empty>
      ) : (
        <div className="stack">
          <div className="stats">
            <Stat label="Paid requests" value={<Num href={api} value={fmtInt(s.paid_requests)} />} />
            <Stat label="Tokens served" value={<Num href={api} value={fmtInt(s.tokens_served)} />} />
            <Stat label="Cached prompt tokens" value={<Num href={api} value={fmtInt(s.cached_tokens)} />} />
            <Stat label="Latest record" small value={<Num href={api} value={fmtTs(s.latest_record_at)} />} />
          </div>

          <div className="split">
            <Card
              title={<>Mode A <Tag kind="accent">pay per request</Tag></>}
              actions={<Evidence items={[{ label: "HCS topic", href: env.hcsTopicId ? links.hashscanTopic(env.hcsTopicId) : null }]} />}
            >
              <ol className="flow">
                <li><span>The gateway answers with an HTTP <b>Payment Required</b> response and an exact quote from the token counts.</span></li>
                <li><span>The buyer pays the quote in <b>USDC on Hedera</b>; it settles before any token is generated.</span></li>
                <li><span>The gateway serves the call and anchors the receipt on <b>HCS</b>.</span></li>
              </ol>
              <div className="stats tight" style={{ marginTop: 18 }}>
                <Stat label="Requests" value={<Num href={api} value={fmtInt(s.paid_requests_mode_a)} />} />
                <Stat label="Settled on Hedera" value={<Num href={api} value={fmtInt(s.hedera_settled)} />} />
              </div>
            </Card>
            <Card
              title={<>Mode B <Tag kind="muted">tab on Arc</Tag></>}
              actions={
                <Evidence
                  items={[
                    { label: "escrow", href: env.arcEscrowAddress ? links.arcAddress(env.arcEscrowAddress) : null },
                    { label: "source", href: `${env.repoUrl}/blob/main/contracts/src/HeadroomEscrow.sol` },
                  ]}
                />
              }
            >
              <ol className="flow">
                <li><span>The buyer deposits <b>USDC into the escrow on Arc</b> once.</span></li>
                <li><span>Calls draw down the tab with no per-call transaction.</span></li>
                <li><span>The gateway posts a <b>Merkle root per batch</b>; the escrow pays the operator share and refunds the rest.</span></li>
              </ol>
              <div className="stats tight" style={{ marginTop: 18 }}>
                <Stat label="Requests" value={<Num href={api} value={fmtInt(s.paid_requests_mode_b)} />} />
                <Stat label="Batches posted" value={<><Num href={api} value={fmtInt(s.batches_posted)} /> <span className="muted" style={{ fontSize: 14 }}>of</span> <Num href={api} value={fmtInt(s.batches)} /></>} />
              </div>
            </Card>
          </div>

          <Card
            title={view === "receipts" ? "Receipts" : "Batches"}
            sub={
              view === "receipts"
                ? "Newest first. A time opens the ledger row; a price or transaction opens HashScan; a batch opens its settlement."
                : "Newest first. Amount and Merkle root open the Arc transaction that posted them."
            }
            actions={
              <nav className="seg" aria-label="Table">
                <Link href="/payments" aria-current={view === "receipts" ? "true" : undefined}>Receipts</Link>
                <Link href="/payments?view=batches" aria-current={view === "batches" ? "true" : undefined}>Batches</Link>
              </nav>
            }
          >
            {view === "receipts" ? <Receipts ledger={ledger} mode={mode} /> : <Batches ledger={ledger} />}
          </Card>
        </div>
      )}
    </>
  );
}

function Receipts({ ledger, mode }: { ledger: LedgerData; mode: ModeFilter }) {
  const rows = mode === "all" ? ledger.receipts : ledger.receipts.filter((r) => r.mode === mode);
  return (
    <>
      <nav className="seg" aria-label="Mode" style={{ marginBottom: 12 }}>
        <Link href="/payments" aria-current={mode === "all" ? "true" : undefined}>All modes</Link>
        <Link href="/payments?mode=A" aria-current={mode === "A" ? "true" : undefined}>Mode A</Link>
        <Link href="/payments?mode=B" aria-current={mode === "B" ? "true" : undefined}>Mode B</Link>
      </nav>
      {!rows.length ? (
        <Empty>No receipts for this mode yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>time</th><th className="left">mode</th><th className="left">buyer</th><th>prompt</th><th>cached</th><th>completion</th><th>price USDC</th><th className="left">Hedera tx</th><th>HCS seq</th><th className="left">batch</th><th className="left">status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rec = links.record(r.request_id);
                const priceHref = r.mode === "A" && r.payment_tx ? links.hashscanTx(r.payment_tx) : rec;
                return (
                  <tr key={r.request_id}>
                    <td><Num href={rec} value={fmtTs(r.created_at)} /></td>
                    <td className="left">{r.mode === "A" ? <Tag kind="accent">A</Tag> : <Tag kind="muted">B</Tag>}</td>
                    <td className="left"><Num href={buyerLink(r.buyer)} value={short(r.buyer)} title={r.buyer} /></td>
                    <td><Num href={rec} value={fmtInt(r.prompt_tokens)} /></td>
                    <td><Num href={rec} value={fmtInt(r.cached_tokens)} /></td>
                    <td><Num href={rec} value={fmtInt(r.completion_tokens)} /></td>
                    <td><Num href={priceHref} value={fmtUsdc(r.price)} /></td>
                    <td className="left">{r.payment_tx ? <Num href={links.hashscanTx(r.payment_tx)} value={short(r.payment_tx, 12, 8)} title={r.payment_tx} /> : <span className="muted">tab</span>}</td>
                    <td>{r.hcs_seq == null ? <span className="muted">none</span> : <Num href={env.hcsTopicId ? links.hashscanTopic(env.hcsTopicId) : rec} value={fmtInt(r.hcs_seq)} />}</td>
                    <td className="left">{r.batch_id ? <Num href={links.batch(r.batch_id)} value={short(r.batch_id, 10, 4)} title={r.batch_id} /> : <span className="muted">none</span>}</td>
                    <td className="left"><StatusBadge status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Batches({ ledger }: { ledger: LedgerData }) {
  if (!ledger.batches.length) return <Empty>No batches yet.</Empty>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>batch</th><th className="left">buyer</th><th>records</th><th>tokens</th><th>amount USDC</th><th>baseline USDC</th><th className="left">Merkle root</th><th className="left">Arc tx</th><th>window ends</th><th className="left">status</th><th>created</th></tr>
        </thead>
        <tbody>
          {ledger.batches.map((b) => {
            const ev = links.batch(b.batch_id);
            const tx = b.post_tx ? links.arcTx(b.post_tx) : ev;
            return (
              <tr key={b.batch_id}>
                <td><Num href={ev} value={short(b.batch_id, 12, 4)} title={b.batch_id} /></td>
                <td className="left"><Num href={buyerLink(b.buyer)} value={short(b.buyer)} title={b.buyer} /></td>
                <td><Num href={ev} value={fmtInt(b.record_count)} /></td>
                <td><Num href={ev} value={fmtInt(b.tokens)} /></td>
                <td><Num href={tx} value={fmtUsdc(b.amount)} /></td>
                <td><Num href={ev} value={fmtUsdc(b.baseline_amount)} /></td>
                <td className="left"><Num href={tx} value={short(b.merkle_root, 10, 6)} title={b.merkle_root} /></td>
                <td className="left">{b.post_tx ? <Num href={links.arcTx(b.post_tx)} value={short(b.post_tx, 10, 6)} title={b.post_tx} /> : <span className="muted">not posted</span>}</td>
                <td><Num href={ev} value={fmtTs(b.window_ends)} /></td>
                <td className="left"><StatusBadge status={b.status} /></td>
                <td><Num href={ev} value={fmtTs(b.created_at)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const kind = /^(done|paid|posted|settled|finalized|released)$/i.test(status) ? "ok" : /fail|error|reject|expired/i.test(status) ? "danger" : "muted";
  return <Tag kind={kind}>{status}</Tag>;
}
