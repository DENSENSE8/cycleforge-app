/** unit-id-format.ts ──────────────────────────────────────────────────────────────────── Pure (no-DB, no-`pg`) helpers for the per-unit… */

/**
 * Strip a SKU down to the printable short form used in the unit ID.
 */
export function shortSku(sku: string): string {
  return String(sku ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '') // keep dashes for readability
    .slice(0, 20)
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}

/**
 * ISO 8601 week-year + week number for a UTC date. The Thursday in the
 * given week determines the ISO year — so Dec 29 2025 (Monday) is in ISO
 * week 1 of 2026, and Jan 1 2023 (Sunday) is in ISO week 52 of 2022.
 */
export function isoWeekParts(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to the Thursday in the same ISO week. (getUTCDay returns 0=Sun,
  // 1=Mon, ..., 6=Sat; map 0 → 7 so Monday-based math works.)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayMs = 86400000;
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / dayMs + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

/** Inverse of {@link formatUnitId} — split a `{SKU_SHORT}-{YYWW}-{SEQ6}` unit id back into its parts. */
export function parseUnitId(
  unitId: string,
): { baseSku: string; yyww: string; seq: number } | null {
  const m = /^(.+)-(\d{4})-(\d{6})$/.exec(String(unitId ?? '').trim());
  if (!m) return null;
  return { baseSku: m[1], yyww: m[2], seq: Number(m[3]) };
}

/** Human-readable breakdown of a printed unit id, for UI display (e.g. */
export function describeUnitId(
  unitId: string,
):
  | { baseSku: string; week: number; year: number; seq: number; display: string }
  | null {
  const p = parseUnitId(unitId);
  if (!p) return null;
  const yy = Number(p.yyww.slice(0, 2));
  const ww = Number(p.yyww.slice(2, 4));
  const year = 2000 + yy;
  return {
    baseSku: p.baseSku,
    week: ww,
    year,
    seq: p.seq,
    display: `WK${String(ww).padStart(2, '0')} '${String(yy).padStart(2, '0')} · #${String(p.seq).padStart(6, '0')}`,
  };
}

export function formatUnitId(
  skuShort: string,
  isoYear: number,
  isoWeek: number,
  seq: number,
): string {
  if (!skuShort) throw new Error('formatUnitId: skuShort is empty after normalization');
  if (!Number.isInteger(isoYear) || isoYear < 2000 || isoYear > 2999) {
    throw new Error(`formatUnitId: invalid isoYear ${isoYear}`);
  }
  if (!Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    throw new Error(`formatUnitId: invalid isoWeek ${isoWeek}`);
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`formatUnitId: invalid seq ${seq}`);
  }
  const yy = String(isoYear % 100).padStart(2, '0');
  const ww = String(isoWeek).padStart(2, '0');
  return `${skuShort}-${yy}${ww}-${String(seq).padStart(6, '0')}`;
}
