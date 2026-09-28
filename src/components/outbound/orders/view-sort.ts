/**
 * A list view's `sort` (`VIEW_SPECS[key].sort`) → how the ledger re-cuts the
 * feed's groups. `undefined` = the feed's own ordering (the staffer's sort
 * menu, ship-by by default).
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/types/orders';
import { sortExceptionQueueRows } from '@/lib/orders/order-exception-types';
import type { ViewSort } from '@/lib/views/view-specs';

type DatedGroups = [string, RowGroup<ShippedOrder>[]][];

/** Held orders: missing item number first, then the most orders one pairing releases — one flat section. */
function arrangeByHoldRelease(groups: DatedGroups): DatedGroups {
  const all = groups.flatMap(([, g]) => g);
  if (all.length === 0) return [];
  const ranked = sortExceptionQueueRows(
    all.flatMap((g) =>
      g.rows.map((row) => ({
        id: Number(row.id),
        blockers: [...(row.hold?.blockers ?? [])],
        siblingUnpairedCount: row.hold?.siblingUnpairedCount ?? 0,
      })),
    ),
  );
  const rank = new Map(ranked.map((row, i) => [row.id, i]));
  const best = (group: RowGroup<ShippedOrder>) =>
    Math.min(...group.rows.map((row) => rank.get(Number(row.id)) ?? Number.MAX_SAFE_INTEGER));
  return [['held', [...all].sort((a, b) => best(a) - best(b))]];
}

export const VIEW_SORT_ARRANGE: Readonly<Record<ViewSort, ((groups: DatedGroups) => DatedGroups) | undefined>> = {
  'ship-by': undefined,
  'hold-release': arrangeByHoldRelease,
};
