import { links } from "./env";

export interface Pricing {
  model?: string; currency?: string; units?: string;
  rates?: { uncached_input: number; cached_input: number; output: number };
  usd_per_1m?: { uncached_input: number; cached_input: number; output: number };
  c_a_usd_per_1m?: number | null; c_b_usd_per_1m?: number | null; p_usd_per_1m?: number | null;
  k?: number; m?: number; c_b_modelled?: boolean; gap_negative?: boolean;
  baseline?: { h200_usd_per_hr: number | null; source: string | null; ts: number | null; cre_run_id: string | null; stale: boolean };
  throughput?: { tokens_per_hr_b: number | null; tokens_per_hr_c: number | null; source: string | null };
  price_version?: number; quote_formula?: string;
}
export interface Health { ok?: boolean; model?: string; hcs?: boolean; hcs_pending?: number; ts?: number }

export type Fetched<T> = { ok: true; data: T; url: string } | { ok: false; error: string; url: string };

const TIMEOUT_MS = 2000;

async function getJson<T>(url: string): Promise<Fetched<T>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, error: `http ${res.status}`, url };
    return { ok: true, data: (await res.json()) as T, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : "fetch failed", url };
  } finally {
    clearTimeout(timer);
  }
}

export async function readGateway(): Promise<{ pricing: Fetched<Pricing>; health: Fetched<Health> }> {
  const [pricing, health] = await Promise.all([getJson<Pricing>(links.pricing), getJson<Health>(links.health)]);
  return { pricing, health };
}
