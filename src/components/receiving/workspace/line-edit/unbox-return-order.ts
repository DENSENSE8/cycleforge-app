/**
 * Unbox › Return order — the read model behind the return-found toast and the
 * Return order tab's reason: which order the scanned serial left on, how far
 * that order got (packed · shipped · delivered), and the stored return reason
 * (never guessed).
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import { buyerReturnReason } from '@/lib/orders/order-returns';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

export type ReturnOrderStage = 'packed' | 'shipped' | 'delivered';

export type ReturnOrderRow = Pick<
  ReceivingLineRow,
  'intake_type' | 'receiving_type' | 'carton_intake_type' | 'return_reason'
>;

export interface ReturnOrderModel {
  /** The channel order number, else `#<orders.id>`. */
  orderRef: string;
  stage: ReturnOrderStage;
  /** When the order got furthest: delivered, else scanned out, else packed. */
  stageAt: string | null;
  /** The stored reason when this carton is filed as a return; never guessed. */
  reason: { label: string; code: string | null } | null;
}

export function buildReturnOrderModel(order: ShippedOrder, row: ReturnOrderRow): ReturnOrderModel {
  const deliveredAt = (order.delivered_at ?? '').trim() || null;
  const shippedAt = (order.ship_confirmed_at ?? '').trim() || null;
  const stage: ReturnOrderStage =
    order.is_delivered || deliveredAt ? 'delivered' : order.is_shipped || shippedAt ? 'shipped' : 'packed';
  return {
    orderRef: (order.order_id ?? '').trim() || `#${order.id}`,
    stage,
    stageAt:
      stage === 'delivered'
        ? deliveredAt
        : stage === 'shipped'
          ? shippedAt
          : (order.packed_at ?? '').trim() || null,
    reason: isReturnIntake(row) ? readReturnReason(buyerReturnReason(row.return_reason)) : null,
  };
}
