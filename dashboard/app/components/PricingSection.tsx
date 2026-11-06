import type { Fetched, Health, Pricing } from "@/lib/gateway";
import type { LedgerData } from "@/lib/ledger";
import { env, links } from "@/lib/env";
import { fmt, fmtInt, fmtTsAny, fmtUsdc } from "@/lib/fmt";
import { Num, NoData, Tag } from "./Num";

export function PricingSection({ pricing, health, ledger }: { pricing: Fetched<Pricing>; health: Fetched<Health>; ledger: LedgerData | null }) {
  const p = links.pricing;
  const h = links.health;
  const api = links.ledgerSummary;
  return (
    <section id="pricing">
      <h2>Baseline and pricing</h2>
      <p className="muted">
        The baseline is the hourly rental of a large-memory GPU, fetched by a Chainlink CRE workflow. Headroom's own cost comes from this node's
        rental divided by tokens per hour at the config C capacity point. The buyer pays cost plus a share of the gap. Live values:{" "}
        <a href={p}>pricing JSON</a> · <a href={h}>health JSON</a>
        {env.hcsBaselineTopicId && <> · <a href={links.hashscanTopic(env.hcsBaselineTopicId)}>baseline audit log on HCS</a></>}.
      </p>

      {!pricing.ok ? (
        <p><Tag kind="warn">gateway offline</Tag> <a className="num" href={pricing.url}>{pricing.url}</a></p>
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <div className="k">GPU rental baseline, USD per hour {pricing.data.baseline?.stale && <Tag kind="warn">stale</Tag>}</div>
              <div className="v"><Num href={p} value={fmt(pricing.data.baseline?.h200_usd_per_hr, 2)} /></div>
              <div className="k">
                source <Num href={p} value={pricing.data.baseline?.source ?? null} /> · at <Num href={p} value={fmtTsAny(pricing.data.baseline?.ts)} /> · CRE run{" "}
                <Num href={p} value={pricing.data.baseline?.cre_run_id ?? null} />
              </div>
            </div>
            <div className="card">
              <div className="k">baseline cost c_b, USD per million tokens {pricing.data.c_b_modelled && <Tag kind="muted">modelled</Tag>}</div>
              <div className="v"><Num href={p} value={fmt(pricing.data.c_b_usd_per_1m, 4)} /></div>
            </div>
            <div className="card">
              <div className="k">Headroom cost c_a, USD per million tokens</div>
              <div className="v"><Num href={p} value={fmt(pricing.data.c_a_usd_per_1m, 4)} /></div>
            </div>
            <div className="card">
              <div className="k">price p, USD per million tokens</div>
              <div className="v"><Num href={p} value={fmt(pricing.data.p_usd_per_1m, 4)} /></div>
              <div className="k">operator share k <Num href={p} value={fmt(pricing.data.k, 2)} /> · min margin m <Num href={p} value={fmt(pricing.data.m, 2)} /></div>
            </div>
          </div>

          <table className="dense">
            <thead><tr><th>rate</th><th>micro-USD per million tokens</th><th>USD per million tokens</th></tr></thead>
            <tbody>
              <tr><td>uncached input</td><td><Num href={p} value={fmtInt(pricing.data.rates?.uncached_input)} /></td><td><Num href={p} value={fmt(pricing.data.usd_per_1m?.uncached_input, 6)} /></td></tr>
              <tr><td>cached input</td><td><Num href={p} value={fmtInt(pricing.data.rates?.cached_input)} /></td><td><Num href={p} value={fmt(pricing.data.usd_per_1m?.cached_input, 6)} /></td></tr>
              <tr><td>output</td><td><Num href={p} value={fmtInt(pricing.data.rates?.output)} /></td><td><Num href={p} value={fmt(pricing.data.usd_per_1m?.output, 6)} /></td></tr>
            </tbody>
          </table>
          <p className="muted">
            model <Num href={p} value={pricing.data.model ?? null} /> · price version <Num href={p} value={fmtInt(pricing.data.price_version)} /> · throughput tokens per hour, config B{" "}
            <Num href={p} value={fmtInt(pricing.data.throughput?.tokens_per_hr_b)} /> and config C <Num href={p} value={fmtInt(pricing.data.throughput?.tokens_per_hr_c)} /> from{" "}
            <Num href={p} value={pricing.data.throughput?.source ?? null} />
            {" · "}gateway {health.ok ? <Tag kind="ok">online</Tag> : <Tag kind="warn">offline</Tag>}
            {health.ok && <> · HCS {health.data.hcs ? "enabled" : "disabled"}, pending <Num href={h} value={fmtInt(health.data.hcs_pending)} /></>}
          </p>
        </>
      )}

      <h3>Cost per million tokens against baseline, from the ledger</h3>
      {!ledger ? (
        <NoData />
      ) : (
        <div className="cards">
          <div className="card"><div className="k">records costed</div><div className="v"><Num href={api} value={fmtInt(ledger.summary.done_records_costed)} /></div></div>
          <div className="card"><div className="k">actual cost, USDC</div><div className="v"><Num href={api} value={fmtUsdc(ledger.summary.actual_cost_micro)} /></div></div>
          <div className="card"><div className="k">baseline cost, USDC</div><div className="v"><Num href={api} value={fmtUsdc(ledger.summary.baseline_cost_micro)} /></div></div>
          <div className="card"><div className="k">actual over baseline</div><div className="v"><Num href={api} value={fmt(ledger.summary.cost_ratio, 3)} /></div></div>
          <div className="card"><div className="k">actual, USD per million tokens</div><div className="v"><Num href={api} value={fmt(ledger.summary.cost_per_1m_tokens_usd, 4)} /></div></div>
          <div className="card"><div className="k">baseline, USD per million tokens</div><div className="v"><Num href={api} value={fmt(ledger.summary.baseline_per_1m_tokens_usd, 4)} /></div></div>
        </div>
      )}
    </section>
  );
}
