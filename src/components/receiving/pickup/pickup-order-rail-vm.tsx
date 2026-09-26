/** Adapter: a {@link PickupOrderGroup} → shared `RailRowVM` slots for the Local Pickup sidebar rail. */

import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import {
  pickupOrderNeedsProcess,
  pickupOrderStatusDot,
  pickupOrderStatusLabel,
} from '@/lib/local-pickup/order-status';
import type { PickupOrderGroup } from './pickup-lines';

function groupNeedsProcess(group: PickupOrderGroup): boolean {
  return pickupOrderNeedsProcess({
    status: group.orderStatus,
    receivingId: group.receivingId,
    itemCount: group.itemCount,
  });
}

export function getPickupOrderStatusDot(group: PickupOrderGroup): string {
  return pickupOrderStatusDot(group.orderStatus, {
    receivingId: group.receivingId,
    needsProcess: groupNeedsProcess(group),
  });
}

export function getPickupOrderStatusDotLabel(group: PickupOrderGroup): string {
  return pickupOrderStatusLabel(group.orderStatus, {
    receivingId: group.receivingId,
    needsProcess: groupNeedsProcess(group),
  });
}

export function pickupOrderToRailVM(group: PickupOrderGroup): RailRowVM {
  const title = group.poNumber;
  const customer = (group.customer || 'Local pickup').trim();
  const count = group.itemCount;

  return {
    title,
    titleAttr: title,
    meta: (
      <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
        <span className="truncate">
          {customer}
          <span className="text-text-faint"> · {count}</span>
        </span>
      </span>
    ),
  };
}
