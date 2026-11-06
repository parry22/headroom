import type { Metadata } from "next";
import { getLedger } from "@/lib/data";
import { PaymentsSection, type ModeFilter, type View } from "../components/PaymentsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const q = await searchParams;
  const view: View = q.view === "batches" ? "batches" : "receipts";
  const mode: ModeFilter = q.mode === "A" || q.mode === "B" ? q.mode : "all";
  return <PaymentsSection ledger={await getLedger()} view={view} mode={mode} />;
}
