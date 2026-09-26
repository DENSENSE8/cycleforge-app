/** One row of the Returns desk — a `RETURNED` inventory_event, wire-safe. */

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

/** `payload.order_id` as a number, or null. */
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
