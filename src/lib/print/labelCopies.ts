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

/**
 * Copies of one face are PLATES IN THE RUN — not a printer-side repeat count.
 *
 * A 2×1 run prints one raw job per sticker (that is what the Locations label
 * run does, and what the floor confirms works on the paired CX418). Asking the
 * printer to repeat a raster instead — TSPL `PRINT N,1` / ZPL `^PQN` after a
 * `BITMAP` / `^GF` — is firmware-dependent, and on this hardware it emits ONE
 * label and swallows the rest. That is why the tote Copies field printed a
 * single plate while a 40-bin location run printed all forty.
 *
 * So multiplicity lives here, in the run, for every family: N plates in the
 * list, N awaited jobs, N stickers, and a progress tick that counts paper.
 * Copies of a face stay adjacent (face1×N, then face2×N) so one tote's plates
 * come off the roll together.
 *
 * Callers: printLabelFacesJob (the shared 2×1 channel).
 */
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
