import type { ReactNode } from "react";
import type { Fetched, Health, Pricing } from "@/lib/gateway";
import type { LedgerData } from "@/lib/ledger";
import { env, links, SNAPSHOT } from "@/lib/env";
import { fmt, fmtInt, fmtTsAny, fmtUsdc, isNum } from "@/lib/fmt";
import { Num, Tag } from "./Num";
import { Alert, Card, Empty, Evidence, KV, PageHeader, ResultFigure, Stat } from "./ui";

export function PricingSection({ pricing, health, ledger }: { pricing: Fetched<Pricing>; health: Fetched<Health>; ledger: LedgerData | null }) {
  const p = links.pricing;
  const h = links.health;
  const api = links.ledgerSummary;
  const d = pricing.ok ? pricing.data : null;
  return (
    <>
      <PageHeader title="Priced between our cost and the baseline">
        The baseline is the hourly rental of a large-memory GPU, fetched by a Chainlink CRE workflow. Headroom&apos;s own cost is this node&apos;s
        rental divided by tokens per hour at the config C capacity point. The buyer pays cost plus a share of the gap.
      </PageHeader>
      <div className="stack">
        <Evidence
          items={[
            { label: "pricing JSON", href: SNAPSHOT ? null : p },
            { label: "health JSON", href: SNAPSHOT ? null : h },
            { label: "baseline audit log on HCS", href: env.hcsBaselineTopicId ? links.hashscanTopic(env.hcsBaselineTopicId) : null },
          ]}
        />

        {!d && SNAPSHOT ? (
          <Alert>
            Live prices come from the gateway on the demo machine and are not part of this public snapshot. The ledger figures below are from the
            snapshot; the formula is in the <a href={`${env.repoUrl}/blob/main/gateway/src/pricing.ts`} target="_blank" rel="noreferrer">pricing source</a>.
          </Alert>
        ) : !d ? (
          <Alert kind="warn">
            Gateway offline, so live prices are unavailable. Tried <a href={pricing.url} target="_blank" rel="noreferrer" className="num">{pricing.url}</a>.
          </Alert>
        ) : (
          <>
            <Card>
              <div className="hero">
                <ResultFigure
                  label="Price p, USD per million tokens"
                  value={<Num href={p} value={fmt(d.p_usd_per_1m, 4)} />}
                  line={
                    <>
                      Operator share k <Num href={p} value={fmt(d.k, 2)} />, minimum margin m <Num href={p} value={fmt(d.m, 2)} />, price version{" "}
                      <Num href={p} value={fmtInt(d.price_version)} />.
                    </>
                  }
                />
                <Ladder
                  rows={[
                    { name: <>Baseline c_b {d.c_b_modelled && <Tag kind="muted">modelled</Tag>}</>, v: d.c_b_usd_per_1m, href: p },
                    { name: <>Price p</>, v: d.p_usd_per_1m, href: p, brand: true },
                    { name: <>Headroom cost c_a</>, v: d.c_a_usd_per_1m, href: p },
                  ]}
                />
              </div>
            </Card>

            <div className="split">
              <Card
                title={<>GPU rental baseline {d.baseline?.stale && <Tag kind="warn">stale</Tag>}</>}
                sub="Fetched by the CRE workflow and written to the gateway."
              >
                <KV
                  rows={[
                    { label: "USD per hour", value: <Num href={p} value={fmt(d.baseline?.h200_usd_per_hr, 2)} /> },
                    { label: "Source", small: true, value: <Num href={p} value={d.baseline?.source ?? null} /> },
                    { label: "Fetched at", small: true, value: <Num href={p} value={fmtTsAny(d.baseline?.ts)} /> },
                    { label: "CRE run", small: true, value: <Num href={p} value={d.baseline?.cre_run_id ?? null} /> },
                  ]}
                />
              </Card>
              <Card title="Node" sub="Model, throughput at each config's capacity point, and gateway health.">
                <KV
                  rows={[
                    { label: "Model", small: true, value: <Num href={p} value={d.model ?? null} /> },
                    { label: "Tokens per hour, config B", value: <Num href={p} value={fmtInt(d.throughput?.tokens_per_hr_b)} /> },
                    { label: "Tokens per hour, config C", value: <Num href={p} value={fmtInt(d.throughput?.tokens_per_hr_c)} /> },
                    { label: "Throughput source", small: true, value: <Num href={p} value={d.throughput?.source ?? null} /> },
                    { label: "Gateway", value: health.ok ? <Tag kind="ok" dot>online</Tag> : <Tag kind="warn" dot>offline</Tag> },
                    ...(health.ok
                      ? [{ label: <>HCS {health.data.hcs ? "enabled" : "disabled"}, pending</>, value: <Num href={h} value={fmtInt(health.data.hcs_pending)} /> }]
                      : []),
                  ]}
                />
              </Card>
            </div>

            <Card title="Unit rates" sub="What a request is charged per token class.">
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>rate</th><th>micro-USD per million tokens</th><th>USD per million tokens</th></tr></thead>
                  <tbody>
                    <tr><td>uncached input</td><td><Num href={p} value={fmtInt(d.rates?.uncached_input)} /></td><td><Num href={p} value={fmt(d.usd_per_1m?.uncached_input, 6)} /></td></tr>
                    <tr><td>cached input</td><td><Num href={p} value={fmtInt(d.rates?.cached_input)} /></td><td><Num href={p} value={fmt(d.usd_per_1m?.cached_input, 6)} /></td></tr>
                    <tr><td>output</td><td><Num href={p} value={fmtInt(d.rates?.output)} /></td><td><Num href={p} value={fmt(d.usd_per_1m?.output, 6)} /></td></tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        <Card title="Actual cost against baseline" sub="From the ledger: what served requests cost Headroom, against what the baseline GPU would have cost.">
          {!ledger ? (
            <Empty>No ledger yet.</Empty>
          ) : (
            <div className="stats tight">
              <Stat label="Records costed" value={<Num href={api} value={fmtInt(ledger.summary.done_records_costed)} />} />
              <Stat label="Actual cost, USDC" value={<Num href={api} value={fmtUsdc(ledger.summary.actual_cost_micro)} />} />
              <Stat label="Baseline cost, USDC" value={<Num href={api} value={fmtUsdc(ledger.summary.baseline_cost_micro)} />} />
              <Stat label="Actual over baseline" value={<Num href={api} value={fmt(ledger.summary.cost_ratio, 3)} />} />
              <Stat label="Actual, USD per M tokens" value={<Num href={api} value={fmt(ledger.summary.cost_per_1m_tokens_usd, 4)} />} />
              <Stat label="Baseline, USD per M tokens" value={<Num href={api} value={fmt(ledger.summary.baseline_per_1m_tokens_usd, 4)} />} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/** Baseline, price and cost on one scale. Bar length is presentation only; each figure links to the pricing JSON. */
function Ladder({ rows }: { rows: { name: ReactNode; v: number | null | undefined; href: string; brand?: boolean }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.v).filter(isNum));
  return (
    <div className="ladder" aria-label="price ladder">
      {rows.map((r, i) => (
        <div className="ladder-row" key={i}>
          <span className="name">{r.name}</span>
          <span className="v">
            <Num href={r.href} value={fmt(r.v, 4)} />
          </span>
          <div className="meter">
            {isNum(r.v) && max > 0 ? <span className={r.brand ? "brand" : undefined} style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
