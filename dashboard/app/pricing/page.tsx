import type { Metadata } from "next";
import { getGateway, getLedger } from "@/lib/data";
import { PricingSection } from "../components/PricingSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const [gw, ledger] = await Promise.all([getGateway(), getLedger()]);
  return (
    <>
      <PricingSection pricing={gw.pricing} health={gw.health} ledger={ledger} />
    </>
  );
}
