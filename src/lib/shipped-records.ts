import type { PackerRecord } from '@/hooks/usePackerLogs';
import { outboundSignals } from '@/lib/orders/outbound-signals';
import {
  deriveOutboundState,
  hasLeftWarehouse,
  effectiveShipTime,
  type WithOutboundState,
} from '@/lib/outbound-state';

export type DerivedPackerRecord = PackerRecord & WithOutboundState;

// FBA records are identified by scan_ref matching Amazon's FBA shipment ID format (FBAxxxxxxxx) or by tracking_type being 'FBA' / 'FNSKU'.
const FBA_SHIPMENT_ID_RE = /^FBA[0-9A-Z]{8,}$/i;

export function isFbaPackerRecord(record: { scan_ref?: string | null; tracking_type?: string | null }): boolean {
  const scanRef = String(record.scan_ref || '').trim();
  const ttype = String(record.tracking_type || '').toUpperCase();
  return FBA_SHIPMENT_ID_RE.test(scanRef) || ttype === 'FBA' || ttype === 'FNSKU';
}

// SKU records are identified by tracking_type === 'SKU' (set by packer_logs.tracking_type)
// or by scan_ref containing ':' (the "SKU_VALUE:QUANTITY" format used at the pack station).
export function isSkuPackerRecord(record: { scan_ref?: string | null; tracking_type?: string | null }): boolean {
  const ttype = String(record.tracking_type || '').toUpperCase();
  if (ttype === 'SKU') return true;
  const scanRef = String(record.scan_ref || '').trim();
  return scanRef.includes(':');
}

export function hasLinkedOrder(record: { order_row_id?: number | null; order_id?: string | null }): boolean {
  if (record.order_row_id != null) return true;
  return String(record.order_id || '').trim().length > 0;
}

export function isExceptionPackerRecord(record: { row_source?: string | null; exception_reason?: string | null }): boolean {
  return String(record.row_source || '').trim().toLowerCase() === 'exception'
    || !!String(record.exception_reason || '').trim();
}

/**
 * Shipped-tab membership. A row belongs here only when a dock scan-out stamped
 * a staff id AND a real timestamp. Packed-in-staging is To-ship / Scan-out,
 * never history.
 */
export function isShippedDeskRow(row: {
  ship_confirmed_at?: string | null;
  shipped_out_by?: number | null;
  latest_status_category?: string | null;
  is_terminal?: boolean | null;
}): boolean {
  const at = String(row.ship_confirmed_at ?? '').trim();
  const staff = Number(row.shipped_out_by);
  const dockConfirmed = Boolean(at && at !== '1' && Number.isFinite(staff) && staff > 0);
  if (dockConfirmed) return true;

  // A carrier delivery/custody scan is stronger evidence that a package left
  // than a missing legacy dock event. This also makes the canonical ORPHAN
  // state reachable: it belongs in Shipped for reconciliation, never back in
  // the warehouse work queue. DELIVERED remains the final status face.
  const category = String(row.latest_status_category ?? '').trim().toUpperCase();
  return ['ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'].includes(category)
    || (row.is_terminal === true && category !== 'EXCEPTION');
}
/** Collapse duplicate scans of the SAME package, while keeping a multi-package order as one row PER package (they ship at different times). */
export function dedupeShippedRecords(records: PackerRecord[]): PackerRecord[] {
  const seen = new Map<string, PackerRecord>();
  [...records].sort((a, b) => a.id - b.id).forEach((record) => {
    const orderKey = String(record.order_id || '').trim();
    const key =
      record.package_shipment_id != null
        ? `package:${record.package_shipment_id}`
        : orderKey
          ? `order:${orderKey}`
          : `scan:${(record.shipping_tracking_number || record.scan_ref || String(record.id)).trim()}`;
    seen.set(key, record);
  });
  return Array.from(seen.values());
}

/** Attach the derived outbound state (packed-time vs left-warehouse-time) to a record. */
export function deriveShippedRecord(r: PackerRecord): DerivedPackerRecord {
  const input = outboundSignals({
    packedAt: r.created_at,
    shipConfirmedAt: r.ship_confirmed_at ?? null,
    latestStatusCategory: r.latest_status_category ?? null,
    latestEventAt: r.latest_event_at ?? null,
    isTerminal: r.is_terminal ?? null,
    hasException: r.has_exception ?? null,
  });
  return {
    ...r,
    outboundState: deriveOutboundState(input),
    hasLeft: hasLeftWarehouse(input),
    effShipTime: effectiveShipTime(input),
  };
}
