/**
 * Which selected Stock rows a BIN verb may actually write — the desk's verb
 * precondition, as a pure function.
 *
 * ## The trap this module exists for
 *
 * `/inventory/stock` unions two pairings (see `location-stock-queries.ts`), and
 * only one of them is writable through the bin endpoints:
 *
 * | fact | `source: 'bin'` | `source: 'unit'` |
 * |---|---|---|
 * | backing table | `bin_contents` | `serial_units.current_location` |
 * | qty means | a counted quantity | a COUNT of serials |
 * | adjust | `PATCH /api/locations/[barcode]` | meaningless — a serial exists or it does not |
 * | move | `POST /api/transfers` | `PATCH /api/serial-units/[id]/move`, per unit |
 *
 * So every verb on the action strip is conditional on the ROW, and the
 * condition belongs on the fact rather than on the route. A verb offered on a
 * row it cannot serve is worse than an absent verb, and silently applying the
 * bin path to a unit row would move "whichever 3" serials with no audit story.
 *
 * `TABLE_ENGINE_LAW.verbsBindToFields` rules what a mixed selection does:
 * *"A mixed selection resolves, it does not hide. The verb offers the direction
 * that applies to the majority and names the remainder in the disabled
 * reason."* That is exactly {@link StockBinWritePlan} — `targets` is what the
 * press will write, `skipped` is the remainder, and `note` is the sentence the
 * strip prints so the operator reads the refusal before pressing.
 *
 * Pure on purpose: the failure mode of this task is a mixed selection, and a
 * pure planner is testable without a DOM or a network
 * (`stock-bin-writes.test.ts`).
 */

import {
  locationStockRowId,
  type LocationStockTableRow,
} from './location-stock-row';

/** Why a selected row cannot reach a bin endpoint. */
export type StockBinWriteRefusal =
  /** Serialized units — `serial_units`, not `bin_contents`. */
  | 'unit-source'
  /** A free-text placement that resolves to no `locations` row (`85`, `QA-BIN-1`). */
  | 'unresolved-location'
  /** A real location with no scannable handle; every bin endpoint is barcode-keyed. */
  | 'no-barcode';

/**
 * Operator sentences, one per refusal, in both numbers.
 *
 * A single phrasing cannot serve both: "1 serialized units" is the kind of
 * sentence that makes an operator distrust the rest of the strip. Each entry
 * carries the singular and the plural, and both name the NEXT MOVE rather
 * than just the refusal.
 */
export const STOCK_BIN_WRITE_REFUSAL: Record<
  StockBinWriteRefusal,
  { one: string; many: string }
> = {
  'unit-source': {
    one: 'a serialized unit — move it from the unit desk, one unit at a time',
    many: 'serialized units — move them from the unit desk, one unit at a time',
  },
  'unresolved-location': {
    one: 'a placement naming no registered location — re-place it first',
    many: 'placements naming no registered location — re-place them first',
  },
  'no-barcode': {
    one: 'a location with no barcode — the bin endpoints are barcode-keyed',
    many: 'locations with no barcode — the bin endpoints are barcode-keyed',
  },
};

/** One writable row, reduced to what the bin endpoints take. */
export interface StockBinWriteTarget {
  /** {@link locationStockRowId} — the selection key, so a caller can re-find the row. */
  rowId: string;
  /** `locations.barcode` — the handle `PATCH /api/locations/[barcode]` and `/api/transfers` use. */
  barcode: string;
  sku: string;
  /** The counted quantity standing here right now — the ceiling for a take or a move. */
  qty: number;
  /** What the operator sees on the row: the bin code, and the product if we know it. */
  face: string;
}

/** One refused row, with the reason it is out of reach. */
export interface StockBinWriteSkip {
  rowId: string;
  refusal: StockBinWriteRefusal;
  face: string;
}

export interface StockBinWritePlan {
  /** Rows the press will write, in selection order. */
  targets: readonly StockBinWriteTarget[];
  /** Rows the press will skip. */
  skipped: readonly StockBinWriteSkip[];
  /**
   * The remainder, as one sentence — `null` when nothing is skipped.
   *
   * Prints beside the verbs when some rows are writable ("2 of 7 rows skipped:
   * serialized units …") and becomes the DISABLED reason when none are.
   */
  note: string | null;
}

/** The face an operator reads on the row — bin code first, product second. */
function faceOf(row: LocationStockTableRow): string {
  const place = (row.location_barcode ?? row.location_name ?? '?').trim() || '?';
  return `${place} · ${row.sku}`;
}

function refusalFor(row: LocationStockTableRow): StockBinWriteRefusal | null {
  if (row.source !== 'bin') return 'unit-source';
  if (row.location_id == null) return 'unresolved-location';
  if (!(row.location_barcode ?? '').trim()) return 'no-barcode';
  return null;
}

/**
 * Build the sentence that names the remainder.
 *
 * Refusals are listed in the order they were met, each with its own count, so
 * a selection that mixes units AND unresolved placements says both — a single
 * "some rows skipped" would hide the half the operator can still fix.
 */
function noteFor(
  skipped: readonly StockBinWriteSkip[],
  total: number,
): string | null {
  if (skipped.length === 0) return null;
  const counts = new Map<StockBinWriteRefusal, number>();
  for (const skip of skipped) {
    counts.set(skip.refusal, (counts.get(skip.refusal) ?? 0) + 1);
  }
  /**
   * "all 2 rows are 2 serialized units" says the number twice. When the head
   * already carries the total and there is only one kind of refusal, the
   * phrase drops its count and reads as the rest of that sentence.
   */
  const headCarriesTotal = skipped.length === total && counts.size === 1;
  const parts = [...counts].map(([refusal, count]) => {
    const phrase = STOCK_BIN_WRITE_REFUSAL[refusal];
    if (count === 1) return phrase.one;
    return headCarriesTotal ? phrase.many : `${count} ${phrase.many}`;
  });
  const head =
    skipped.length === total
      ? total === 1
        ? 'Nothing to write here: this row is'
        : `Nothing to write here: all ${total} rows are`
      : `${skipped.length} of ${total} rows skipped:`;
  return `${head} ${parts.join('; ')}`;
}

/**
 * Split a selection into what a bin verb writes and what it refuses.
 *
 * Every verb on the strip runs this first: `targets.length === 0` disables the
 * verb and `note` becomes its reason, which is how a selection of nothing but
 * serialized units reads as an explanation rather than a dead button.
 */
export function planStockBinWrites(
  rows: readonly LocationStockTableRow[],
): StockBinWritePlan {
  const targets: StockBinWriteTarget[] = [];
  const skipped: StockBinWriteSkip[] = [];
  for (const row of rows) {
    const rowId = locationStockRowId(row);
    const refusal = refusalFor(row);
    if (refusal) {
      skipped.push({ rowId, refusal, face: faceOf(row) });
      continue;
    }
    targets.push({
      rowId,
      barcode: (row.location_barcode as string).trim(),
      sku: row.sku,
      qty: Number(row.qty) || 0,
      face: faceOf(row),
    });
  }
  return { targets, skipped, note: noteFor(skipped, rows.length) };
}
