/**
 * Warehouse-wide stock-by-location slot resolvers — pure.
 *
 * `last_counted` resolves to the ABSOLUTE INSTANT, never to a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depended on `now`
 * would sort and search differently on every render.
 *
 * A missing bound (`min_qty` / `max_qty` is `NULL`) resolves to `null` text and
 * the cell dashes — a pair with no floor is not a pair with a floor of zero.
 *
 * {@link locationStockLevel} lives here, beside the facts it reads, so the
 * STATE pill and the bound `level` track can never disagree: the adapter
 * imports this function rather than re-deriving the word.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { formatStagedLocationFace } from '@/lib/receiving/recent-staged-location';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';

/**
 * The per-pair stock level, in the vocabulary the `bins` overview already
 * publishes — `location-queries.ts` SQL exposes `has_low_stock`
 * (`qty < COALESCE(min_qty, -1)`) and `is_over_capacity`, and the ceiling here
 * is the pair's own `max_qty`, the per-SKU form of that capacity.
 *
 * There is no `Empty` word, and that is the feed's shape rather than an
 * omission: `getStockByLocation` selects `bc.qty <> 0`, so a zero pair never
 * reaches this desk and a word nothing can resolve to would be a dead filter
 * value and a dead sort bucket.
 *
 * `Stocked` is the no-breach word, and it covers a pair with no bounds set at
 * all: saying "In range" of a pair with neither a floor nor a ceiling would
 * claim a range nobody configured.
 */
export type LocationStockLevel = 'Low' | 'Over' | 'Stocked';

export function locationStockLevel(row: LocationStockTableRow): LocationStockLevel {
  if (row.min_qty != null && row.qty < row.min_qty) return 'Low';
  if (row.max_qty != null && row.qty > row.max_qty) return 'Over';
  return 'Stocked';
}

/**
 * How this stock is HELD, as the floor says it.
 *
 * `Bin count` is loose stock somebody counted into a bin; `Units` is serialized
 * units standing there. One word each because the two carry different verbs: a
 * bin quantity is adjusted by a count or a transfer, a unit is moved as an
 * object with its own serial. The desk unions both feeds, so the row has to say
 * which — a picker sent to "scan 4" at a bin that holds four SERIALS is being
 * sent to scan a quantity that has no barcode.
 */
export type LocationStockHeldAs = 'Bin count' | 'Units';

export function locationStockHeldAs(row: LocationStockTableRow): LocationStockHeldAs {
  return row.source === 'unit' ? 'Units' : 'Bin count';
}

/**
 * The location's own handle — the house coalesce, then the house CODEC.
 *
 * `formatStagedLocationFace` picks WHICH handle (barcode → room · name → name
 * → row/col), so a bin reads the same here as it does at the station that
 * scanned it. `parseLocationCodeFlat` + `locationCode` then render a structured
 * bin code in its SEGMENTED form: `C0409200` → `C-04-09-2-00`.
 *
 * The dashes are not decoration. The flat code is eight undifferentiated
 * characters, and a desk row is read by eye rather than by scanner — the
 * segments are zone · aisle · bay · level · position, which is the order a
 * picker walks, and `C-04-09-2-00` beside `C-04-11-1-00` shows at a glance
 * that the two are two bays apart (operator 2026-09-15: *"ensure the location
 * id is displaying with dashes as well, easier to read"*). It is the same
 * codec the phone's pairing screens already paint, so the two surfaces agree
 * character for character.
 *
 * A handle that is NOT a structured code — `TECH-PARTS`, `UNSORTED`, or the
 * raw text an unresolved placement wrote — does not parse and is returned
 * untouched. Clipboard copy carries whatever is painted, and the dashed form
 * is what an operator reads back into a search box, so both stay one string.
 *
 * **The EXACT location and nothing else** (operator 2026-09-15: *"the id for
 * the exact location is good in the id column"*). This briefly prefixed the
 * room to put both facts leftmost; the room is a COLUMN of its own instead, so
 * prefixing it here would state it twice on every row and make the Id header's
 * sort order disagree with the Room header's.
 */
export function locationStockLocationLabel(row: LocationStockTableRow): string {
  const face =
    formatStagedLocationFace({
      name: row.location_name,
      barcode: row.location_barcode,
      room: row.room,
      rowLabel: row.row_label,
      colLabel: row.col_label,
    }) || `#${row.location_id}`;
  const segments = parseLocationCodeFlat(face);
  return segments ? locationCode(segments) : face;
}

/** What the item cell says this row is about: the catalog title, else the SKU. */
export function locationStockItemLabel(row: LocationStockTableRow): string {
  return str(row.product_title) ?? row.sku;
}

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** A number fact, or `null` when the column is unset (never `"null"`). */
function num(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

export function resolveLocationStockSlotValue(
  row: LocationStockTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'location-stock.location':
      return { kind: 'value', text: locationStockLocationLabel(row) };
    case 'location-stock.item':
      return { kind: 'value', text: locationStockItemLabel(row) };
    case 'location-stock.qty':
      return { kind: 'value', text: num(row.qty) };
    case 'location-stock.room':
      return { kind: 'value', text: str(row.room) };
    case 'location-stock.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'location-stock.source':
      return { kind: 'value', text: locationStockHeldAs(row) };
    case 'location-stock.min_qty':
      return { kind: 'value', text: num(row.min_qty) };
    case 'location-stock.max_qty':
      return { kind: 'value', text: num(row.max_qty) };
    case 'location-stock.level':
      return { kind: 'value', text: locationStockLevel(row) };
    case 'location-stock.last_counted':
      return { kind: 'value', text: str(row.last_counted) };
    default:
      return null;
  }
}
