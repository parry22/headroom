import { readBench } from "@/lib/bench";
import { env, FIXTURE_BENCH, links } from "@/lib/env";
import { readGateway } from "@/lib/gateway";
import { readLedger } from "@/lib/ledger";
import { DemandSection } from "./components/DemandSection";
import { MemorySection } from "./components/MemorySection";
import { Tag } from "./components/Num";
import { PaidSection } from "./components/PaidSection";
import { PricingSection } from "./components/PricingSection";
import { TabSection } from "./components/TabSection";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [bench, ledger, gw] = await Promise.all([
    Promise.resolve(readBench()),
    Promise.resolve(readLedger(50)),
    readGateway(),
  ]);
  const benchFixture = bench?.source === FIXTURE_BENCH;

  return (
    <>
      <header>
        <h1>Headroom</h1>
        <p className="thesis">
          Inference priced by memory headroom: a tiered KV cache lets one GPU hold more live sessions, and every request pays for what it
          used, settled on chain, with every number on this page linked to its evidence.
        </p>
        <nav>
          <a href={env.repoUrl}>repository</a>
          <a href={links.pricing}>pricing</a>
          <a href={links.health}>health</a>
          <a href={links.benchLatest}>bench JSON</a>
          <a href={links.ledgerSummary}>ledger summary</a>
          {env.hcsTopicId && <a href={links.hashscanTopic(env.hcsTopicId)}>HCS topic</a>}
          {env.arcEscrowAddress && <a href={links.arcAddress(env.arcEscrowAddress)}>Arc escrow</a>}
          {env.arcStudioUrl && <a href={env.arcStudioUrl}>Arc Studio</a>}
          {gw.health.ok ? <Tag kind="ok">gateway online</Tag> : <Tag kind="warn">gateway offline</Tag>}
        </nav>
      </header>
      <main>
        <MemorySection bench={bench} fixture={benchFixture} />
        <PaidSection ledger={ledger} />
        <TabSection ledger={ledger} />
        <PricingSection pricing={gw.pricing} health={gw.health} ledger={ledger} />
        <DemandSection ledger={ledger} />
      </main>
      <footer>
        <p className="muted">
          Rule: no number on this page is typed by hand. Each one is a link to the bench file, transaction or gateway endpoint it came from.
          Missing data shows as “no data yet”.
        </p>
      </footer>
    </>
  );
}
