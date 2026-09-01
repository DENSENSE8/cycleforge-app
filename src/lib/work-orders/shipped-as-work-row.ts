import type { WorkOrderRow } from '@/components/work-orders/types';
import type { ShippedOrder } from '@/types/orders';
import { isOutOfStock } from '@/utils/order-out-of-stock';

/**
 * Adapt a to-ship {@link ShippedOrder} onto the work-order row the mobile
 * inset groups already know how to band and render. Phone-only: the desk
 * keeps its spreadsheet; this is the empty-assigned "all orders" list.
 */
export function shippedOrderAsWorkRow(row: ShippedOrder): WorkOrderRow {
  const orderId = String(row.order_id || '').trim();
  const assigned = row.tester_id != null || row.packer_id != null;
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
    techId: row.tester_id ?? null,
    techName: row.tester_name ?? null,
    packerId: row.packer_id ?? null,
    packerName: row.packed_by_name ?? null,
    status: assigned ? 'ASSIGNED' : 'OPEN',
    priority: 100,
    deadlineAt: row.ship_by_date || row.deadline_at || null,
    notes: row.notes ?? null,
    assignedAt: null,
    updatedAt: null,
    orderId: orderId || null,
    trackingNumber: row.shipping_tracking_number ?? null,
    itemNumber: row.item_number ?? null,
    sku: row.sku ?? null,
    condition: row.condition ?? null,
    shipmentId: row.shipment_id ?? null,
    accountSource: row.account_source ?? null,
    quantity: row.quantity ?? null,
    outOfStock: isOutOfStock(row) ? 'Out of stock' : null,
  };
}

export function shippedOrdersAsWorkRows(rows: readonly ShippedOrder[]): WorkOrderRow[] {
  return rows.map(shippedOrderAsWorkRow);
}
