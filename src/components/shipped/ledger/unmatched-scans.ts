/**
 * Fulfilled's open unmatched scans (`GET /api/orders-exceptions/unmatched`):
 * every pack scan or dock scan-out that matched no order. A dock miss has no
 * station_activity_logs row, so the feed never carries it — the desk paints
 * it from here as its own row, and copies every tracking number from here.
 */

import type { OpenUnmatchedScan, OpenUnmatchedScansResponse } from '@/lib/orders-exceptions';
import { deriveShippedRecord, type DerivedPackerRecord } from '@/lib/shipped-records';

export const OPEN_UNMATCHED_SCANS_QUERY_KEY = ['orders-exceptions', 'unmatched'] as const;

export async function fetchOpenUnmatchedScans(signal?: AbortSignal): Promise<OpenUnmatchedScan[]> {
  const res = await fetch('/api/orders-exceptions/unmatched', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load unmatched scans');
  const body = (await res.json()) as OpenUnmatchedScansResponse;
  return body.scans;
}

/**
 * A dock miss as a Fulfilled feed row: a negative id (never a SAL id), no
 * package, its scan instant as the dock stamp, and the open exception that
 * holds it — so the card, chips and summary read it as an unmatched scan-out.
 */
export function unmatchedScanOutRecord(scan: OpenUnmatchedScan): DerivedPackerRecord {
  return deriveShippedRecord({
    id: -scan.id,
    created_at: scan.createdAt,
    scan_ref: scan.tracking,
    shipping_tracking_number: scan.tracking,
    packed_by: null,
    tracking_type: 'ORDERS',
    order_id: null,
    account_source: null,
    product_title: null,
    condition: null,
    sku: null,
    notes: scan.notes,
    packer_photos_url: [],
    row_source: 'exception',
    orders_exception_id: scan.id,
    exception_reason: 'not_found',
    exception_status: 'open',
    exception_source_station: scan.sourceStation,
    ship_confirmed_at: scan.createdAt,
    shipped_out_by: scan.staffId,
    shipped_out_by_name: scan.staffName,
  });
}

/** Tracking numbers as the clipboard takes them: trimmed, de-duplicated, one per line. */
export function trackingClipboardText(trackings: readonly string[]): string {
  return Array.from(new Set(trackings.map((tracking) => tracking.trim()).filter(Boolean))).join('\n');
}
