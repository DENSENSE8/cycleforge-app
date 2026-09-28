/**
 * Order within a ship-by SECTION on the To-ship triage list (Late · Due today
 * · Tomorrow · Later · No ship-by): soonest deadline first, or — for "No
 * ship-by", which has no deadline — the oldest order first. The list's one
 * sort control is the sidebar's (`?sort=`, 2026-09-27); sections no longer
 * carry their own. The feed arranges before the record cursor, so J / K and
 * the pages follow this order. Pure: no React.
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/types/orders';
import { ordersShipByRaw } from '@/lib/orders/orders-compound-view';

const time = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
};

function shipBy(group: RowGroup<ShippedOrder>): number | null {
  let best: number | null = null;
  for (const row of group.rows) {
    const t = time(ordersShipByRaw(row));
    if (t != null && (best == null || t < best)) best = t;
  }
  return best;
}

const created = (group: RowGroup<ShippedOrder>) => time(group.rows[0]?.created_at);

/** Ascending; missing values sort last. */
function ascending(pick: (g: RowGroup<ShippedOrder>) => number | null) {
  return (a: RowGroup<ShippedOrder>, b: RowGroup<ShippedOrder>) => {
    const x = pick(a);
    const y = pick(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return x - y;
  };
}

const BY_SHIP_BY = ascending(shipBy);
const BY_CREATED = ascending(created);

/** The section's cards in order; ties keep the feed's order (stable). `dated` = the section has a ship-by. */
export function sortOrderSection(groups: readonly RowGroup<ShippedOrder>[], dated: boolean): RowGroup<ShippedOrder>[] {
  return [...groups].sort(dated ? BY_SHIP_BY : BY_CREATED);
}
