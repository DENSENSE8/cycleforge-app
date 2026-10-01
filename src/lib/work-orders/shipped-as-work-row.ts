import type { WorkOrderRow } from '@/components/work-orders/types';
import type { ShippedOrder } from '@/types/orders';
import { normalizeOutboundHandlingFacts } from '@/lib/shipping/outbound-handling-facts';
import { isOutOfStock } from '@/utils/order-out-of-stock';
import { ordersUrgentLabel } from '@/lib/orders/orders-compound-view';

function asStaffColorHex(raw: string | null | undefined): string | null {
  const hex = String(raw ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/**
 * Adapt a to-ship {@link ShippedOrder} onto the work-order row the mobile
 * inset groups already know how to band and render. Phone-only: the desk
 * keeps its spreadsheet; this is the empty-assigned "all orders" list.
 */
export function shippedOrderAsWorkRow(row: ShippedOrder): WorkOrderRow {
  const projected = row as ShippedOrder & {
    has_pick_scan?: boolean | null;
    pack_activity_at?: string | null;
  };
  const orderId = String(row.order_id || '').trim();
  const assigned = row.picker_id != null || row.packer_id != null;
  return {
    id: `ORDER:${row.id}`,
    entityType: 'ORDER',
    entityId: row.id,
    queueKey: 'orders',
    queueLabel: 'Orders',
    title: (row.product_title || orderId || 'Untitled order').trim(),
    subtitle: '',
    recordLabel: orderId || `#${row.id}`,
    sourcePath: `/m/orders/${encodeURIComponent(orderId || String(row.id))}`,
    // The phone's Pick mark: the ORDER/PICK assignee.
    techId: row.picker_id ?? null,
    techName: row.picker_name ?? null,
    techColorHex: asStaffColorHex(row.picker_color_hex),
    packerId: row.packer_id ?? null,
    packerName: row.packer_name ?? row.packed_by_name ?? null,
    packerColorHex: asStaffColorHex(row.packer_color_hex),
    status: assigned ? 'ASSIGNED' : 'OPEN',
    priority: 100,
    // Exact assignment time wins. `ship_by_date` is a date-only fallback and
    // must never masquerade as an SLA countdown on a phone.
    deadlineAt: row.deadline_at || row.ship_by_date || null,
    notes: row.notes ?? null,
    buyerNote: String(row.buyer_note ?? '').trim() || null,
    assignedAt: null,
    updatedAt: null,
    createdAt: row.created_at ?? null,
    orderId: orderId || null,
    trackingNumber: row.shipping_tracking_number ?? null,
    itemNumber: row.item_number ?? null,
    sku: row.sku ?? null,
    condition: row.condition ?? null,
    catalogCategory: row.catalog_category ?? null,
    serialNumber: String(row.serial_number || '').trim() || null,
    shipmentId: row.shipment_id ?? null,
    fulfillmentChannel: row.fulfillment_channel ?? null,
    accountSource: row.account_source ?? null,
    quantity: row.quantity ?? null,
    saleAmount: row.sale_amount ?? null,
    currency: row.currency ?? null,
    imageUrl: String(row.catalog_image_url || '').trim() || null,
    hasPickScan: Boolean(projected.has_pick_scan),
    packedAt: row.packed_at ?? projected.pack_activity_at ?? null,
    dockStagedAt: row.dock_staged_at ?? null,
    storageLocations: row.storage_locations ?? null,
    allocatedUnitCount: row.allocated_unit_count ?? null,
    pickedUnitCount: row.picked_unit_count ?? null,
    handlingFacts: normalizeOutboundHandlingFacts(row.catalog_handling_flags),
    outOfStock: isOutOfStock(row) ? 'Out of stock' : null,
    isUrgent: Boolean(row.is_urgent),
    urgentLabel: ordersUrgentLabel(row),
  };
}

function shippedOrdersAsWorkRows(rows: readonly ShippedOrder[]): WorkOrderRow[] {
  return rows.map(shippedOrderAsWorkRow);
}
