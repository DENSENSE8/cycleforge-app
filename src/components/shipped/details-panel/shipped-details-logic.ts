import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { DeleteOrderRowPayload } from '@/hooks/useDeleteOrderRow';
import { getStaffName } from '@/utils/staff';
import { toPSTDateKey } from '@/utils/date';
import { resolveFulfillmentLane, hasLeftWarehouse, carrierHasCustody } from '@/lib/order-lifecycle';

/**
 * Has this order shipped (left the warehouse)? The canonical "post-dock" test —
 * scanned out at the dock, or the carrier already has custody
 * (accepted/in-transit/out-for-delivery/delivered/returned), or a derived
 * shipped/delivered flag. Gates edits that must freeze once an order is gone
 * (e.g. the condition grade — you can't re-grade what already shipped).
 */
export function isOrderShipped(shipped: ShippedOrder): boolean {
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
    techId: shipped.tester_id ?? null,
    techName: shipped.tester_name || null,
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

export type StatusTone = 'emerald' | 'red' | 'yellow';

export interface ShippedHeaderMeta {
  outOfStockValue: string;
  hasOutOfStock: boolean;
  testedById: number | null;
  canEditAssignment: boolean;
  hasTechScan: boolean;
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

/** Canonical quick-action order for order rows + shipped detail headers. */
export const SHIPPED_QUICK_ACTION_KEYS = ['urgent', 'notes', 'out_of_stock', 'status'] as const;

export type ShippedQuickActionKey = (typeof SHIPPED_QUICK_ACTION_KEYS)[number];

/** Order header quick actions: urgent → notes → out of stock → mark shipped. */
export function buildShippedHeaderQuickActions<T extends { key: string }>(
  actions: T[],
): T[] {
  const byKey = new Map(actions.map((action) => [action.key, action]));
  return SHIPPED_QUICK_ACTION_KEYS.map((key) => byKey.get(key)).filter(Boolean) as T[];
}

export type ShippedRowEditTarget =
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
  const hasTechScan = Boolean((shipped as any).has_tech_scan);
  // State decision flows through the canonical fulfillment projection so this
  // header pill can never disagree with the order's board lane (the projection
  // is exception‑first: out‑of‑stock → BLOCKED wins over a tech scan). Tone +
  // label below are presentation only.
  const lane = resolveFulfillmentLane({ hasTechScan, isOutOfStock: hasOutOfStock });
  const statusTone: StatusTone = lane === 'TESTED' ? 'emerald' : lane === 'BLOCKED' ? 'red' : 'yellow';
  const statusLabel =
    lane === 'TESTED'
      ? `Tested by ${getStaffName(testedById)}`
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
    hasTechScan,
    statusTone,
    statusLabel,
    orderIdTrimmed,
    showExceptionsFallback,
    orderIdDisplay,
  };
}

/**
 * Resolve which delete request a shipped row maps to, or null when the row id
 * is invalid. Negative ids and `row_source === 'exception'` delete the
 * exception; FBA/FNSKU/SKU/SCAN tracking types (or activity-log-keyed rows)
 * delete the packing log; everything else deletes the order.
 */
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

// ─── Order pipeline (Tested → Packed → Scanned Out) ─────────────────────────

export type OrderPipelineStageKey = 'tested' | 'packed' | 'scanned_out';
export type OrderPipelineStageState = 'done' | 'active' | 'pending';

const ORDER_PIPELINE_ORDER: readonly OrderPipelineStageKey[] = ['tested', 'packed', 'scanned_out'];

/** A real timestamp — non-empty and not the legacy `'1'` sentinel. */
function hasOrderStamp(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim();
  return trimmed !== '' && trimmed !== '1';
}

/** The stamp itself when real, else null — for feeding display rows. */
export function orderStampOrNull(value: string | null | undefined): string | null {
  return hasOrderStamp(value) ? String(value) : null;
}

/**
 * Which lifecycle phase the panel body should present for. The panel keeps ONE
 * skeleton (stepper + facts) but shifts emphasis by phase — an empty order is
 * short and action-first; a shipped order is provenance + carrier tracking.
 *   - `pending`     — nothing done yet; no milestone rows, just a next-step line.
 *   - `in_progress` — 1–2 milestones stamped; show only the stamped rows.
 *   - `shipped`     — left the warehouse (scan-out or carrier custody); carrier
 *                     status becomes a first-class fact.
 */
export type OrderPipelinePhase = 'pending' | 'in_progress' | 'shipped';

export interface OrderPipeline {
  states: Record<OrderPipelineStageKey, OrderPipelineStageState>;
  phase: OrderPipelinePhase;
  /** One-line teaching callout — the operator's next action, or "Shipped". */
  nextStep: string;
  /** The package has left the building (scan-out or carrier custody). */
  postDock: boolean;
}

export interface OrderPipelineInput {
  testedAt: string | null | undefined;
  packedAt: string | null | undefined;
  scannedOutAt: string | null | undefined;
  /** Carrier status-category (`shipping_tracking_numbers.latest_status_category`). */
  latestStatusCategory?: string | null;
  /** SAL SHIP_CONFIRM instant — an explicit internal scan-out. */
  shipConfirmedAt?: string | null;
}

/**
 * Derive the full order pipeline model — stepper states, presentation phase, the
 * next-step callout, and post-dock — from the order's stamps + carrier signals.
 * The single SoT the panel body reads (mirrors `deriveCartonReadiness` for the
 * receiving carton pipeline); pure, no Date.now, safe on client and server.
 */
export function deriveOrderPipeline(input: OrderPipelineInput): OrderPipeline {
  const states = deriveOrderPipelineStates(input);
  const postDock = hasLeftWarehouse({
    shipConfirmedAt: input.shipConfirmedAt ?? input.scannedOutAt ?? null,
    latestStatusCategory: input.latestStatusCategory ?? null,
  });

  const anyDone =
    states.tested === 'done' || states.packed === 'done' || states.scanned_out === 'done';
  const phase: OrderPipelinePhase = postDock || states.scanned_out === 'done'
    ? 'shipped'
    : anyDone
      ? 'in_progress'
      : 'pending';

  const nextStep =
    states.tested === 'active'
      ? 'Awaiting testing'
      : states.packed === 'active'
        ? 'Awaiting pack'
        : states.scanned_out === 'active'
          ? 'Awaiting scan-out'
          : carrierHasCustody({ latestStatusCategory: input.latestStatusCategory ?? null })
            ? 'In carrier custody'
            : 'Shipped';

  return { states, phase, nextStep, postDock };
}

/**
 * Derive the Tested → Packed → Scanned Out stepper states from the three stage
 * stamps. Completeness-checklist semantics (not a wizard): a stage is `done`
 * the moment its own stamp exists, regardless of order; the first unstamped
 * stage is `active` (the next job); later unstamped stages are `pending`.
 * Stages are never folded — packing does not imply a test happened (prepacked
 * orders legitimately skip it), so an unstamped Tested stays honest.
 */
export function deriveOrderPipelineStates(stamps: {
  testedAt: string | null | undefined;
  packedAt: string | null | undefined;
  scannedOutAt: string | null | undefined;
}): Record<OrderPipelineStageKey, OrderPipelineStageState> {
  const done: Record<OrderPipelineStageKey, boolean> = {
    tested: hasOrderStamp(stamps.testedAt),
    packed: hasOrderStamp(stamps.packedAt),
    scanned_out: hasOrderStamp(stamps.scannedOutAt),
  };
  const states = {} as Record<OrderPipelineStageKey, OrderPipelineStageState>;
  let activeAssigned = false;
  for (const key of ORDER_PIPELINE_ORDER) {
    if (done[key]) {
      states[key] = 'done';
    } else if (!activeAssigned) {
      states[key] = 'active';
      activeAssigned = true;
    } else {
      states[key] = 'pending';
    }
  }
  return states;
}

/** Format a date value to `MM-DD-YY` in PST, or '' when absent/unparseable. */
export function toMonthDayYearCurrent(value: string | null | undefined): string {
  if (!value) return '';
  const pstDateKey = toPSTDateKey(value);
  if (!pstDateKey) return '';
  const [year, month, day] = pstDateKey.split('-').map(Number);
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${String(year % 100).padStart(2, '0')}`;
}
