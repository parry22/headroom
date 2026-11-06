import type { LedgerData } from "@/lib/ledger";
import { env, links } from "@/lib/env";
import { fmtInt } from "@/lib/fmt";
import { Num, NoData, Tag } from "./Num";

export function DemandSection({ ledger }: { ledger: LedgerData | null }) {
  const api = links.ledgerSummary;
  return (
    <section id="demand">
      <h2>Demand {ledger?.fixture && <Tag kind="warn">sample fixture</Tag>}</h2>
      <p className="muted">
        Wallets outside the team{env.teamWallets.length ? "" : " (no team wallets configured, so every wallet counts)"}, from the same ledger.
      </p>
      {!ledger ? (
        <NoData />
      ) : (
        <div className="cards">
          <div className="card"><div className="k">external wallets</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.external_buyers)} /></div></div>
          <div className="card"><div className="k">external paid requests</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.external_requests)} /></div></div>
          <div className="card"><div className="k">external tokens</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.external_tokens)} /></div></div>
          <div className="card"><div className="k">tokens served, all wallets</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.tokens_served)} /></div></div>
        </div>
      )}
    </section>
  );
}
