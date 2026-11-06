/** Formatting only: no arithmetic beyond unit presentation (micro-USDC to USDC, fraction to percent). */

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function fmt(v: number | null | undefined, digits = 1): string | null {
  if (!isNum(v)) return null;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(v: number | null | undefined): string | null {
  return isNum(v) ? Math.round(v).toLocaleString("en-US") : null;
}

/** micro-USDC integer to a USDC string with six decimals. */
export function fmtUsdc(micro: number | null | undefined): string | null {
  if (!isNum(micro)) return null;
  return (micro / 1e6).toFixed(6);
}

/** fraction (0..1) to percent with one decimal. */
export function fmtPct(frac: number | null | undefined): string | null {
  if (!isNum(frac)) return null;
  return `${(frac * 100).toFixed(1)}%`;
}

/** ms epoch to ISO string (UTC). */
export function fmtTs(ms: number | null | undefined): string | null {
  if (!isNum(ms)) return null;
  try { return new Date(ms).toISOString(); } catch { return null; }
}

/** seconds epoch to ISO string (UTC). Gateway baseline.ts is seconds or ms; pick by magnitude. */
export function fmtTsAny(t: number | null | undefined): string | null {
  if (!isNum(t)) return null;
  return fmtTs(t < 1e12 ? t * 1000 : t);
}

export function short(s: string | null | undefined, head = 10, tail = 6): string | null {
  if (!s) return null;
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}
