import type { Metadata } from "next";
import { getBench } from "@/lib/data";
import { FIXTURE_BENCH } from "@/lib/env";
import { MemorySection } from "../components/MemorySection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Memory proof" };

export default async function MemoryPage() {
  const bench = await getBench();
  return (
    <>
      <MemorySection bench={bench} fixture={bench?.source === FIXTURE_BENCH} />
    </>
  );
}
