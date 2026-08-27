/** One `tracking_exceptions` row as returned by `GET /api/tracking-exceptions`. */
export interface TrackingExceptionRow {
  id: number;
  tracking_number: string;
  domain: 'orders' | 'receiving';
  source_station: string;
  staff_id: number | null;
  staff_name: string | null;
  staff_display_name: string | null;
  exception_reason: string;
  notes: string | null;
  status: 'open' | 'resolved' | 'discarded';
  shipment_id: number | null;
  receiving_id: number | null;
  last_zoho_check_at: string | null;
  zoho_check_count: number;
  last_error: string | null;
  domain_metadata: Record<string, unknown> | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  receiving_source: string | null;
  receiving_zoho_po_id: string | null;
  receiving_carrier: string | null;
}

export type TrackingExceptionStatusFilter = 'open' | 'resolved' | 'discarded' | 'all';

/** Carrier shown in the map — join first, then domain metadata, else Unknown. */
export function trackingExceptionCarrier(row: TrackingExceptionRow): string {
  const fromJoin = (row.receiving_carrier || '').trim();
  if (fromJoin && fromJoin.toUpperCase() !== 'UNKNOWN') return fromJoin;
  const meta = row.domain_metadata;
  const fromMeta = typeof meta?.carrier === 'string' ? meta.carrier.trim() : '';
  if (fromMeta) return fromMeta;
  return 'Unknown';
}

export function trackingExceptionStaffLabel(row: TrackingExceptionRow): string {
  return row.staff_display_name || row.staff_name || '';
}
