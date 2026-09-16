/**
 * One row of the Returns desk — a `RETURNED` inventory_event, wire-safe.
 *
 * Lifted out of `/inventory/returns/page.tsx` so the RSC page, the
 * resolver and the adapter can all name the same shape. The page is a server
 * component and the table is a client island, so this is the type that crosses
 * the boundary: two fields are normalized on the way out and nothing else
 * changes.
 *
 * - `occurred_at` is an ISO STRING, not a `Date`. The slot resolver's law is
 *   that the same row resolves the same text at any time (see
 *   `inventory-events-resolve.ts`), and an instant that has to survive the RSC
 *   boundary is a string on both sides of it.
 * - `order_id` replaces the raw `payload` bag. The desk painted exactly one
 *   fact out of it (`payload.order_id`, spliced into the reason cell as
 *   `· ord#N`); that is a FACT of its own, so it is lifted here and bound as
 *   `admin-returns.order_ref` rather than string-concatenated into the notes.
 *   Nothing else in `payload` was painted, and nothing else is carried.
 *
 * Field names stay snake_case — the same wire names the `inventory-events`
 * catalog documents in its `paths`, which is what lets the Returns desk REUSE
 * those field definitions instead of forking a second vocabulary for the same
 * facts.
 */

/** The raw `SELECT` shape `loadRecentReturns` reads out of `inventory_events`. */
export interface RecentReturnQueryRow {
  id: number;
  occurred_at: Date | string;
  serial_unit_id: number | null;
  sku: string | null;
  prev_status: string | null;
  scan_token: string | null;
  notes: string | null;
  payload: Record<string, unknown> | null;
  actor_name: string | null;
}

/** The desk row — what the client island and the family resolver read. */
export interface RecentReturnRow {
  id: number;
  /** Absolute instant, ISO-8601. */
  occurred_at: string;
  serial_unit_id: number | null;
  sku: string | null;
  prev_status: string | null;
  scan_token: string | null;
  notes: string | null;
  /** `payload.order_id`, lifted to a first-class fact. */
  order_id: number | null;
  actor_name: string | null;
}

/**
 * `payload.order_id` as a number, or null.
 *
 * The payload is an untyped JSONB bag, so the id arrives as a number on rows
 * the intake wrote and as a string on rows some older writer wrote. Both are
 * the same fact; anything else (an object, a float, an empty string) is not an
 * order reference and reads as absent rather than as `ord#NaN`.
 */
export function readReturnOrderId(
  payload: Record<string, unknown> | null | undefined,
): number | null {
  const raw = payload?.order_id;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const n = Number(raw);
    return n > 0 ? n : null;
  }
  return null;
}

/** Query row → desk row. Pure; the only place `payload` and `Date` are read. */
export function toRecentReturnRow(raw: RecentReturnQueryRow): RecentReturnRow {
  const occurred = raw.occurred_at;
  return {
    id: raw.id,
    occurred_at:
      occurred instanceof Date ? occurred.toISOString() : String(occurred ?? '').trim(),
    serial_unit_id: raw.serial_unit_id,
    sku: raw.sku,
    prev_status: raw.prev_status,
    scan_token: raw.scan_token,
    notes: raw.notes,
    order_id: readReturnOrderId(raw.payload),
    actor_name: raw.actor_name,
  };
}
