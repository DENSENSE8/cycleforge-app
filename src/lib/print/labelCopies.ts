/**
 * Shared clamps for 2×1 bulk print. Kept dependency-free so routing can own
 * `?count=` without pulling the barcode engine — and so server-side zod
 * schemas can import a bound without dragging in realtime wire types.
 */

export const MAX_LABEL_COPIES = 99;

/**
 * The FNSKU quantity slider's scale (owner 2026-10-04): the staffer picks how
 * far the slider reaches — 20, 30 or 99 — and the stops rescale to it. A UI
 * scale, not a limit: the wire clamp stays {@link MAX_LABEL_COPIES}. Shared by
 * the desk Print station and `/m/fnsku`; remembered per staffer in
 * `staff_preferences.prefs.fnskuCopyRange`.
 */
export const FNSKU_COPY_RANGES = [20, 30, MAX_LABEL_COPIES] as const;
export type FnskuCopyRange = (typeof FNSKU_COPY_RANGES)[number];
export const DEFAULT_FNSKU_COPY_RANGE: FnskuCopyRange = 30;

/** Useful print-run sizes per range. Manual entry inserts its exact value into the scale. */
export const FNSKU_COPY_STOPS: Record<FnskuCopyRange, readonly number[]> = {
  20: [1, 2, 3, 5, 8, 10, 12, 15, 20],
  30: [1, 2, 5, 10, 15, 20, 25, 30],
  [MAX_LABEL_COPIES]: [1, 2, 5, 10, 20, 30, 40, 50, 75, MAX_LABEL_COPIES],
};

export function isFnskuCopyRange(n: unknown): n is FnskuCopyRange {
  return FNSKU_COPY_RANGES.includes(n as FnskuCopyRange);
}

/** A copy count held inside one range: 1..range. */
export function clampToCopyRange(n: number | null | undefined, range: FnskuCopyRange): number {
  return Math.min(range, clampLabelCopies(n));
}

/** Ceiling on one bulk TOTE run — distinct from {@link MAX_LABEL_COPIES}, which counts identical copies of ONE face. */
export const MAX_TOTE_PRINT_RUN = 200;

/** Ceiling on one paperwork print job — orders whose label / slip / manuals print in one station run. */
export const MAX_PAPERWORK_PRINT_ORDERS = 25;

/** Slider ceiling on the tote-print UI — a cart, not a warehouse. */
export const TOTE_COUNT_SLIDER_MAX = 24;

export const DEFAULT_TOTE_COPIES_PER_SIDE = 1;

export function clampToteCount(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(TOTE_COUNT_SLIDER_MAX, Math.trunc(n)));
}

export function clampCopiesPerSide(n: number | null | undefined): number {
  return clampLabelCopies(n);
}

/** Identical stickers of one tote identity — the Copies field, not × sides. */
export function platesPerTote(copiesPerSide: number | null | undefined): number {
  return clampCopiesPerSide(copiesPerSide);
}

/** Copies of one face are PLATES IN THE RUN — not a printer-side repeat count. */
export function expandPlateRun<T>(items: readonly T[], copies: number | null | undefined): T[] {
  const n = clampLabelCopies(copies);
  if (n === 1) return [...items];
  return items.flatMap((item) => Array.from({ length: n }, () => item));
}

/** Total stickers: tote count × copies. 24 × 4 = 96. */
export function toteRunPlateCount(
  totes: number | null | undefined,
  copiesPerSide: number | null | undefined,
): number {
  return clampToteCount(totes) * clampCopiesPerSide(copiesPerSide);
}

/** House `H-{id}` typed into reprint — null when it is an external code. */
export function parseHouseToteId(raw: string | null | undefined): number | null {
  const trimmed = String(raw ?? '').trim();
  const match = /^H-(\d+)$/i.exec(trimmed);
  if (match) return Number(match[1]);
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return id > 0 ? id : null;
  }
  return null;
}

export function clampLabelCopies(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_LABEL_COPIES, Math.trunc(n)));
}
