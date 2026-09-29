/**
 * A list view's `sort` (`VIEW_SPECS[key].sort`) → how the ledger re-cuts the
 * feed's groups. `undefined` = the feed's own ordering (the staffer's sort
 * menu, ship-by by default).
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/types/orders';
import type { ViewSort } from '@/lib/views/view-specs';

type DatedGroups = [string, RowGroup<ShippedOrder>[]][];

export const VIEW_SORT_ARRANGE: Readonly<Record<ViewSort, ((groups: DatedGroups) => DatedGroups) | undefined>> = {
  'ship-by': undefined,
};
