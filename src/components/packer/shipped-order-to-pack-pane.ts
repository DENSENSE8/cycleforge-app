import type { ShippedOrder } from '@/types/orders';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

/** Map an Unshipped/Queue row into the pack overlay pane payload. */
export function shippedOrderToPackPane(record: ShippedOrder): PackActiveOrderPane {
  const qtyRaw = Number(record.quantity ?? 1);
  return {
    orderRowId: Number.isFinite(record.id) && record.id > 0 ? record.id : null,
    orderId: String(record.order_id || '').trim(),
    productTitle: String(record.product_title || '').trim() || 'Unknown product',
    qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1,
    condition: String(record.condition || '').trim() || 'N/A',
    tracking: String(record.shipping_tracking_number || '').trim(),
    sku: String(record.sku || '').trim() || undefined,
    scanType: 'ORDERS',
    packerLogId:
      record.packer_log_id != null && Number(record.packer_log_id) > 0
        ? Number(record.packer_log_id)
        : null,
    scanDriven: false,
  };
}
