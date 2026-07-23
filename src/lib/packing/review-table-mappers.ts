/**
 * Map Review queue / order rows into the OrdersGridView `ShippedOrder` shape
 * so History (and any verification-enriched open) can reuse the SoT table.
 */

import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';
import type { ShippedOrder } from '@/types/orders';

/** Extra fields we hang on ShippedOrder for Review (cast at the call site). */
export type ReviewTableOrder = ShippedOrder & {
  verification_outcome?: string | null;
  packer_log_id?: number | null;
};

export function packReviewRowToShippedOrder(row: PackReviewQueueRow): ReviewTableOrder {
  return {
    id: row.packerLogId,
    order_id: row.orderId || `PL-${row.packerLogId}`,
    product_title: row.productTitle || 'Packed order',
    condition: '',
    serial_number: '',
    sku: '',
    tester_id: null,
    tested_by: null,
    test_date_time: null,
    packer_id: row.verifiedByStaffId,
    packed_by: row.verifiedByStaffId,
    packed_at: row.createdAt,
    packer_photos_url: [],
    tracking_type: 'ORDERS',
    account_source: null,
    notes: row.reviewNote || '',
    status_history: null,
    created_at: row.createdAt,
    shipping_tracking_number: row.tracking || row.detectedTracking,
    shipment_id: row.shipmentId,
    packer_log_id: row.packerLogId,
    verification_outcome: row.outcome,
  };
}

export function shippedOrderToPackReviewRow(
  order: ReviewTableOrder,
  fallback?: Partial<PackReviewQueueRow>,
): PackReviewQueueRow {
  const packerLogId =
    Number(order.packer_log_id) ||
    Number(fallback?.packerLogId) ||
    0;
  return {
    packerLogId,
    outcome: String(order.verification_outcome || fallback?.outcome || 'UNVERIFIED'),
    detectedTracking: fallback?.detectedTracking ?? null,
    detectedOrderId: fallback?.detectedOrderId ?? null,
    shipmentId:
      order.shipment_id != null && Number.isFinite(Number(order.shipment_id))
        ? Number(order.shipment_id)
        : (fallback?.shipmentId ?? null),
    reviewNote: fallback?.reviewNote ?? null,
    verifiedByStaffId: fallback?.verifiedByStaffId ?? null,
    ocrConfidence: fallback?.ocrConfidence ?? null,
    createdAt: order.packed_at || order.created_at || new Date().toISOString(),
    orderId: order.order_id || fallback?.orderId || null,
    productTitle: order.product_title || fallback?.productTitle || null,
    tracking:
      (order.shipping_tracking_number || '').trim() ||
      fallback?.tracking ||
      null,
  };
}
