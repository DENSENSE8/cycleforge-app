import { type PackerRecord } from '@/hooks/usePackerLogs';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

/**
 * Stable, UNIQUE rail row id — the `station_activity_logs` id, the same row
 * identity `packerRecordToDetail` uses.
 *
 * Deliberately NOT `packer_log_id`: several scans can share one packer log (the
 * dual-link path attaches a unit-QR scan to the active order's log), so keying
 * rows by it produced duplicate React keys. `PackActiveOrderPane` carries
 * `packerLogId`, so selection resolves by *finding* the matching row rather than
 * by treating the log id as a row id — see `PackRecentPacksRail`.
 */
export function packerRecordRailId(record: PackerRecord): number {
  return Number(record.id);
}

/**
 * Map a packer-log record into the pack overlay pane payload — the rail's
 * counterpart to {@link shippedOrderToPackPane} (Queue rows). Selecting a
 * recent pack re-opens it in the right pane, which crossfades table → panel.
 */
export function packerRecordToPackPane(record: PackerRecord): PackActiveOrderPane {
  const trackingType = String(record.tracking_type || 'ORDERS').toUpperCase();
  const scanType: PackActiveOrderPane['scanType'] =
    trackingType === 'SKU' ? 'SKU' : trackingType === 'REPAIR' ? 'REPAIR' : 'ORDERS';
  const qtyRaw = Number(record.quantity ?? 1);
  const orderRowIdRaw = Number(record.order_row_id ?? 0);
  const packerLogIdRaw = Number(record.packer_log_id ?? 0);
  const orderId = String(record.order_id || '').trim();
  const orderRowId = Number.isFinite(orderRowIdRaw) && orderRowIdRaw > 0 ? orderRowIdRaw : null;
  const isUnknownOrder =
    String(record.row_source || '').trim().toLowerCase() === 'exception' ||
    Boolean(String(record.exception_reason || '').trim()) ||
    (!orderId && !orderRowId);

  return {
    orderRowId,
    orderId,
    productTitle: isUnknownOrder
      ? 'Unknown order'
      : String(record.product_title || '').trim() || 'Unknown product',
    qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1,
    condition: String(record.condition || '').trim() || '—',
    tracking: String(record.shipping_tracking_number || '').trim(),
    sku: String(record.sku || '').trim() || undefined,
    scanType,
    packerLogId:
      Number.isFinite(packerLogIdRaw) && packerLogIdRaw > 0 ? packerLogIdRaw : null,
    // Rail selection is pointer-driven, not a scan — keeps the overlay's
    // remount key on the `row-` axis (see PackOrderWorkspace).
    scanDriven: false,
    isUnknownOrder,
  };
}

/**
 * Map a packer-log record into the shared shipped-details payload shape
 * consumed by the details panel (`open-shipped-details` event detail).
 */
export function packerRecordToDetail(record: PackerRecord) {
  return {
    id: record.id,
    ship_by_date: '',
    order_id: record.order_id || '',
    product_title: record.product_title || '',
    item_number: null,
    condition: record.condition || '',
    shipping_tracking_number: record.shipping_tracking_number || '',
    tracking_numbers: record.tracking_numbers || [],
    tracking_number_rows: record.tracking_number_rows || [],
    serial_number: '',
    sku: record.sku || '',
    tester_id: null,
    tested_by: null,
    test_date_time: null,
    packer_id: record.packed_by || null,
    packed_by: record.packed_by || null,
    packed_at: record.created_at || null,
    packer_photos_url: record.packer_photos_url || [],
    tracking_type: record.tracking_type || null,
    account_source: record.account_source || null,
    notes: '',
    status_history: [],
    is_shipped: undefined,
    created_at: record.created_at || null,
    quantity: record.quantity || '1',
    packer_log_id: record.packer_log_id ?? null,
    station_activity_log_id: record.id,
    fnsku:
      record.fnsku ||
      (String(record.tracking_type || '').toUpperCase() === 'FNSKU'
        ? String(record.scan_ref || '').trim() || null
        : null),
    fnsku_log_id: record.fnsku_log_id ?? null,
  };
}

/** Stable detail id for a packer record (matches the dispatched payload's id). */
export function getPackerDetailId(record: PackerRecord): number {
  return Number(packerRecordToDetail(record).id);
}
