/**
 * Adapter: a {@link PickupOrderGroup} → shared `RailRowVM` slots for the Local
 * Pickup sidebar rail. Sibling of `pack-record-rail-vm` / Unbox
 * `ReceivingRowMain` — layout comes from `RailRowBody`; this module only
 * supplies slot CONTENT. Status presentation resolves through
 * `@/lib/local-pickup/order-status` (never a rail-local Draft/Done map).
 */

import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import {
  pickupOrderStatusDot,
  pickupOrderStatusLabel,
} from '@/lib/local-pickup/order-status';
import type { PickupOrderGroup } from './pickup-lines';

export function getPickupOrderStatusDot(group: PickupOrderGroup): string {
  return pickupOrderStatusDot(group.orderStatus);
}

export function getPickupOrderStatusDotLabel(group: PickupOrderGroup): string {
  return pickupOrderStatusLabel(group.orderStatus);
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
