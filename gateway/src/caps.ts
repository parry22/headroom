/** Spend controls (F5). Checked before quoting, so a refused request never reaches vLLM. */
import type { Ledger } from "./ledger.js";

export interface CapCheck { ok: boolean; reason?: string; detail?: Record<string, unknown> }

export function checkCaps(ledger: Ledger, buyer: string | undefined, model: string, quote: number,
                          maxPriceHeader: string | undefined, now = Date.now()): CapCheck {
  if (maxPriceHeader !== undefined) {
    const max = Number(maxPriceHeader);
    if (!Number.isFinite(max) || max < 0) return { ok: false, reason: "bad_max_price_header" };
    if (quote > max) return { ok: false, reason: "price_above_max", detail: { quote, max } };
  }
  if (!buyer) return { ok: true };
  const b = ledger.getBudget(buyer);
  if (!b) return { ok: true };
  if (b.allowlist.length && !b.allowlist.includes(model)) return { ok: false, reason: "model_not_allowlisted", detail: { model } };
  if (b.max_price_per_request != null && quote > b.max_price_per_request)
    return { ok: false, reason: "price_above_buyer_max", detail: { quote, max: b.max_price_per_request } };
  if (b.daily_cap != null) {
    const spent = ledger.dailySpend(buyer, now);
    if (spent + quote > b.daily_cap) return { ok: false, reason: "daily_cap_exceeded", detail: { spent, quote, cap: b.daily_cap } };
  }
  return { ok: true };
}
