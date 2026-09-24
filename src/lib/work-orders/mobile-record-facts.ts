/**
 * Phone industrial record facts from a queue `WorkOrderRow` — the same
 * `LIFECYCLE` key, next step and ship-by inputs the desk ledger resolves from
 * its `ShippedOrder`, through the shared workflow SoT
 * (`resolveOutboundWorkflowFacts` → `orderLifecycleState`). Pure.
 */

import type { WorkOrderRow } from '@/components/work-orders/types';
import type { LifecycleState } from '@/design-system/tokens/lifecycle';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import { orderLifecycleState } from '@/lib/order-lifecycle';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import { toShipOrderId } from '@/lib/work-orders/to-ship-assignment';
import { getDaysLateNullable, toPSTDateKey } from '@/utils/date';

/**
 * The queue row the phone record reads. Named here so `/m` components take it
 * from `src/lib` (ARCHITECTURE rule 2) rather than from a desktop component
 * module.
 */
export type MobileRecordRow = WorkOrderRow;

export interface MobileRecordFacts {
  state: LifecycleState;
  next: { label: string; tip?: string; blocked?: boolean };
  orderLabel: string;
  shipByKey: string | null;
  overdueDays: number;
  dueToday: boolean;
  qty: number;
  price: string | null;
  initials: string;
}

export function mobileRecordFacts(
  row: WorkOrderRow,
  opts: { blocked: boolean; todayKey: string },
): MobileRecordFacts {
  const workflow = resolveOutboundWorkflowFacts({
    shipmentId: row.shipmentId,
    hasTechScan: row.hasTechScan,
    packedAt: row.packedAt,
    dockStagedAt: row.dockStagedAt,
    isOutOfStock: opts.blocked || Boolean(String(row.outOfStock || '').trim()),
    deadlineAt: row.deadlineAt,
  });
  const shipByKey = row.deadlineAt ? toPSTDateKey(row.deadlineAt) || null : null;
  const late = getDaysLateNullable(row.deadlineAt);
  const qty = Number(String(row.quantity ?? '').trim());
  const words = (row.title || '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return {
    state: orderLifecycleState(workflow.stage, { urgent: Boolean(row.isUrgent) }),
    next: workflow.nextStep,
    orderLabel: toShipOrderId(row),
    shipByKey,
    overdueDays: late != null && late > 0 ? late : 0,
    dueToday: shipByKey != null && shipByKey === opts.todayKey,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    price: formatSalePrice(row.saleAmount, row.currency) || null,
    initials:
      words
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || 'CF',
  };
}
