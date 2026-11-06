import Link from "next/link";
import type { ReactNode } from "react";
import { getBench, getGateway, getLedger } from "@/lib/data";
import { env, FIXTURE_BENCH, links, SNAPSHOT } from "@/lib/env";
import { fmt, fmtInt, isNum } from "@/lib/fmt";
import { AutoRefresh } from "./components/AutoRefresh";
import { Feed } from "./components/Feed";
import { ArrowRight } from "./components/icons";
import { NoData, Num, Tag } from "./components/Num";
import { Card, KV, PageHeader } from "./components/ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [bench, ledger, gw] = await Promise.all([getBench(), getLedger(), getGateway()]);
  const fixture = bench?.source === FIXTURE_BENCH || ledger?.fixture;
  const s = ledger?.summary;
  const api = links.ledgerSummary;
  const rep = bench?.evidence.reportMd ?? links.benchLatest;
  const pr = gw.pricing.ok ? gw.pricing.data : null;

  return (
    <>
      <PageHeader eyebrow={fixture ? <Tag kind="warn">sample fixture</Tag> : undefined} title="Inference priced by memory headroom" actions={SNAPSHOT ? undefined : <AutoRefresh />}>
        A tiered KV cache lets one GPU hold more live sessions, so each token costs less to serve. Buyers pay for exactly what they used, and every
        payment settles on chain.
      </PageHeader>

      <div className="story">
        <Claim
          step="The memory"
          title={isNum(bench?.report.gains.n_c_over_n_b) && (bench?.report.gains.n_c_over_n_b ?? 0) > 1 ? "More live sessions per GPU" : "Live sessions per GPU, against the baseline"}
          big={bench ? <><Num href={rep} value={fmt(bench.report.gains.n_c_over_n_b, 2)} /><span className="unit">×</span></> : <NoData />}
          sub={
            bench ? (
              <>
                With DRAM and NVMe tiers, config C holds <Num href={rep} value={fmtInt(bench.report.capacity.C)} /> sessions under the latency bar.
                The tuned baseline holds <Num href={rep} value={fmtInt(bench.report.capacity.B)} />.
              </>
            ) : (
              "No bench report yet."
            )
          }
          href="/memory"
          more="Memory proof"
        />
        <Claim
          step="The cost"
          title={isNum(s?.cost_ratio) && (s?.cost_ratio ?? 1) < 1 ? "Cheaper per token than the baseline" : "Cost per token, against the baseline"}
          big={s ? <><Num href={api} value={fmt(s.cost_per_1m_tokens_usd, 4)} /><span className="unit">USD/M</span></> : <NoData />}
          sub={
            s ? (
              <>
                Actual cost on served requests, against <Num href={api} value={fmt(s.baseline_per_1m_tokens_usd, 4)} /> on a rented large-memory GPU.
                {pr && isNum(pr.p_usd_per_1m) ? (
                  <> Buyers pay <Num href={links.pricing} value={fmt(pr.p_usd_per_1m, 4)} /> per million tokens, in between.</>
                ) : null}
              </>
            ) : (
              "No ledger yet."
            )
          }
          href="/pricing"
          more="Pricing"
        />
        <Claim
          step="The money"
          title="Paid for and settled on chain"
          big={s ? <Num href={api} value={fmtInt(s.paid_requests)} /> : <NoData />}
          sub={
            s ? (
              <>
                Paid requests. <Num href={api} value={fmtInt(s.hedera_settled)} /> settled one by one in USDC on Hedera;{" "}
                <Num href={api} value={fmtInt(s.batches_posted)} /> tab batches posted to the escrow on Arc.
              </>
            ) : (
              "No ledger yet."
            )
          }
          href="/payments"
          more="Payments"
        />
      </div>

      <div className="split wide-left" style={{ alignItems: "start" }}>
        <Card
          title="Latest paid calls"
          sub="Newest first. Mode A pays per request on Hedera; mode B draws from a tab on Arc."
          actions={
            <Link className="chip" href="/payments">
              All receipts
            </Link>
          }
        >
          {ledger ? <Feed rows={ledger.receipts.slice(0, 6)} /> : <NoData />}
        </Card>
        <Card title="Who is paying" sub={env.teamWallets.length ? "Wallets outside the team." : "No team wallets configured, so every wallet counts."}>
          {s ? (
            <KV
              rows={[
                { label: "External wallets", value: <Num href={api} value={fmtInt(s.external_buyers)} /> },
                { label: "External paid requests", value: <Num href={api} value={fmtInt(s.external_requests)} /> },
                { label: "External tokens", value: <Num href={api} value={fmtInt(s.external_tokens)} /> },
                { label: "Tokens served, all wallets", value: <Num href={api} value={fmtInt(s.tokens_served)} /> },
              ]}
            />
          ) : (
            <NoData />
          )}
        </Card>
      </div>
    </>
  );
}

function Claim({ step, title, big, sub, href, more }: { step: string; title: string; big: ReactNode; sub: ReactNode; href: string; more: string }) {
  return (
    <section className="card claim">
      <div className="step">
        <i />
        {step}
      </div>
      <h3>{title}</h3>
      <div className="big text-gradient">{big}</div>
      <p className="sub">{sub}</p>
      <Link className="more" href={href}>
        {more}
        <ArrowRight />
      </Link>
    </section>
  );
}
