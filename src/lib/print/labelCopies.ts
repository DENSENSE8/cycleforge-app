/**
 * Shared clamps for 2×1 bulk print. Kept dependency-free so routing can own
 * `?count=` without pulling the barcode engine — and so server-side zod
 * schemas can import a bound without dragging in realtime wire types.
 */

export const MAX_LABEL_COPIES = 99;

/**
 * Ceiling on one bulk TOTE run — distinct from {@link MAX_LABEL_COPIES}, which
 * counts identical copies of ONE face. This counts DISTINCT boxes, each of
 * which becomes a row in `handling_units`, so it bounds a database write and
 * not just paper.
 *
 * One home, two readers that must agree: the `/m/print` count step and
 * `HandlingUnitBulkCreateBody`. If they drift, the phone offers a run the
 * server refuses. Sized for a cart of stock, not a warehouse — beyond this,
 * mint in batches so one jam does not strand two hundred rows.
 */
export const MAX_TOTE_PRINT_RUN = 200;

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

/** Wire token for `?count=` — digits 1..99, no leading zeros. */
export function parseLabelCopiesWire(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (n < 1 || n > MAX_LABEL_COPIES) return null;
  return trimmed;
}

export function parseLabelCopies(raw: string | null | undefined): number {
  if (!raw) return 1;
  const wire = parseLabelCopiesWire(raw);
  return wire ? Number.parseInt(wire, 10) : 1;
}
