import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { DeleteOrderRowPayload } from '@/hooks/useDeleteOrderRow';
import { getStaffName } from '@/utils/staff';
import { toPSTDateKey } from '@/utils/date';
import { resolveFulfillmentLane, hasLeftWarehouse } from '@/lib/order-lifecycle';

/** Has this order shipped (left the warehouse)? */
function isOrderShipped(shipped: ShippedOrder): boolean {
  if (shipped.is_shipped === true || shipped.is_delivered === true) return true;
  return hasLeftWarehouse({
    shipConfirmedAt: shipped.ship_confirmed_at ?? null,
    latestStatusCategory: shipped.latest_status_category ?? null,
  });
}

/** Build the work-order assignment row model for a shipped order. */
export function buildAssignmentRow(shipped: ShippedOrder): WorkOrderRow {
  return {
    id: `ORDER:${shipped.id}`,
    entityType: 'ORDER',
    entityId: Number(shipped.id),
    queueKey: 'orders',
    queueLabel: 'Orders',
    title: shipped.product_title || 'Untitled order',
    subtitle: [shipped.order_id, shipped.shipping_tracking_number, shipped.sku].filter(Boolean).join(' • '),
    recordLabel: shipped.order_id || shipped.item_number || `Order #${shipped.id}`,
    sourcePath: '/dashboard',
    techId: shipped.picker_id ?? null,
    techName: shipped.picker_name || null,
    packerId: shipped.packer_id ?? null,
    packerName: shipped.packed_by_name || null,
    status: 'ASSIGNED',
    priority: 100,
    deadlineAt: shipped.ship_by_date || shipped.deadline_at || null,
    notes: shipped.notes || null,
    assignedAt: null,
    updatedAt: shipped.created_at || null,
    orderId: shipped.order_id || null,
    trackingNumber: shipped.shipping_tracking_number || null,
    itemNumber: shipped.item_number || null,
    sku: shipped.sku || null,
    condition: shipped.condition || null,
    shipmentId: shipped.shipment_id ?? null,
    accountSource: shipped.account_source || null,
    quantity: shipped.quantity || null,
    createdAt: shipped.created_at || null,
  };
}

type StatusTone = 'emerald' | 'red' | 'yellow';

interface ShippedHeaderMeta {
  outOfStockValue: string;
  hasOutOfStock: boolean;
  testedById: number | null;
  canEditAssignment: boolean;
  hasPickScan: boolean;
  statusTone: StatusTone;
  statusLabel: string;
  orderIdTrimmed: string;
  showExceptionsFallback: boolean;
  orderIdDisplay: string;
}

/** Tracking-exception rows from `orders_exceptions` (search maps `oe.id` → `shipped.id`). */
export function isExceptionShippedRow(shipped: ShippedOrder): boolean {
  const rowId = Number(shipped.id);
  return (shipped as { row_source?: string }).row_source === 'exception' || rowId < 0;
}

type ShippedRowEditTarget =
  | { kind: 'order'; orderId: number }
  | { kind: 'exception'; exceptionId: number };

/**
 * Resolve which API target a shipped-panel row should use for shipping edits.
 * Exception rows address `orders_exceptions`; everything else addresses `orders`.
 */
export function resolveShippedRowEditTarget(shipped: ShippedOrder): ShippedRowEditTarget | null {
  const rowId = Number(shipped.id);
  if (!Number.isFinite(rowId) || rowId === 0) return null;
  if (isExceptionShippedRow(shipped)) {
    const exceptionId = Math.abs(rowId);
    return exceptionId > 0 ? { kind: 'exception', exceptionId } : null;
  }
  return rowId > 0 ? { kind: 'order', orderId: rowId } : null;
}

/**
 * Whether the shipping-info edit pencil/modal is available. Order rows save
 * through `/api/orders/[id]…`; exception rows through `/api/orders-exceptions/[id]`
 * (tracking-only). Invalid / zero ids are not editable.
 */
export function canEditShippingInfo(shipped: ShippedOrder): boolean {
  return resolveShippedRowEditTarget(shipped) != null;
}

/**
 * Derive the header status pill + order-id display for a shipped order. When no
 * canonical `order_id` is present (exceptions rows, partial intake), the header
 * falls back to the absolute table id rendered as an EXCEPTIONS reference.
 */
export function deriveShippedHeaderMeta(shipped: ShippedOrder): ShippedHeaderMeta {
  const hasOutOfStock = Boolean((shipped as any).is_out_of_stock);
  const outOfStockValue = hasOutOfStock ? 'Out of stock' : '';
  const testedById = shipped.tested_by ?? null;
  const canEditAssignment = Number(shipped.id) > 0 && !isExceptionShippedRow(shipped);
  const hasPickScan = Boolean((shipped as any).has_pick_scan);
  // State decision flows through the canonical fulfillment projection so this header pill can never disagree with the order's board lane…
  const lane = resolveFulfillmentLane({ hasPickScan, isOutOfStock: hasOutOfStock });
  const statusTone: StatusTone = lane === 'TESTED' ? 'emerald' : lane === 'BLOCKED' ? 'red' : 'yellow';
  // The TESTED lane is the picked lane (a pick fact, not QC) — name the picker, not the unit tester.
  const statusLabel =
    lane === 'TESTED'
      ? `Picked by ${String(shipped.picked_by_name || '').trim() || getStaffName(shipped.picked_by ?? null)}`
      : lane === 'BLOCKED'
        ? 'Out of stock'
        : 'Pending';
  const orderIdTrimmed = String(shipped.order_id || '').trim();
  const showExceptionsFallback = !orderIdTrimmed;
  const orderIdDisplay = orderIdTrimmed || String(Math.abs(Number(shipped.id)));

  return {
    outOfStockValue,
    hasOutOfStock,
    testedById,
    canEditAssignment,
    hasPickScan,
    statusTone,
    statusLabel,
    orderIdTrimmed,
    showExceptionsFallback,
    orderIdDisplay,
  };
}

/** Resolve which delete request a shipped row maps to, or null when the row id is invalid. */
export function resolveDeleteRequest(shipped: ShippedOrder): DeleteOrderRowPayload | null {
  const rowId = Number(shipped.id);
  const isExceptionRow = (shipped as any).row_source === 'exception' || rowId < 0;
  const targetId = isExceptionRow ? Math.abs(rowId) : rowId;
  if (!Number.isFinite(targetId) || targetId <= 0) return null;

  if (isExceptionRow) {
    return { rowSource: 'exception', exceptionId: targetId };
  }

  const normalizedTrackingType = String((shipped as any).tracking_type || '').toUpperCase();
  const activityLogId = Number((shipped as any).station_activity_log_id || (shipped as any).sal_id) || undefined;
  const packerLogId = Number((shipped as any).packer_log_id) || undefined;
  const isLikelyActivityLogRow = activityLogId != null && Number(activityLogId) === Number(shipped.id);
  const shouldDeletePackingLog =
    normalizedTrackingType === 'FBA' ||
    normalizedTrackingType === 'FNSKU' ||
    normalizedTrackingType === 'SKU' ||
    normalizedTrackingType === 'SCAN' ||
    isLikelyActivityLogRow;

  if (shouldDeletePackingLog) {
    return { rowSource: 'packing_log', activityLogId, packerLogId };
  }
  return { rowSource: 'order', orderId: targetId };
}

// ─── Order pipeline stamps ───────────────────────────────────────────────────

/** A real timestamp — non-empty and not the legacy `'1'` sentinel. */
function hasOrderStamp(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim();
  return trimmed !== '' && trimmed !== '1';
}

/** The stamp itself when real, else null — for feeding display rows. */
function orderStampOrNull(value: string | null | undefined): string | null {
  return hasOrderStamp(value) ? String(value) : null;
}

/** Format a date value to `MM-DD-YY` in PST, or '' when absent/unparseable. */
export function toMonthDayYearCurrent(value: string | null | undefined): string {
  if (!value) return '';
  const pstDateKey = toPSTDateKey(value);
  if (!pstDateKey) return '';
  const [year, month, day] = pstDateKey.split('-').map(Number);
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${String(year % 100).padStart(2, '0')}`;
}
