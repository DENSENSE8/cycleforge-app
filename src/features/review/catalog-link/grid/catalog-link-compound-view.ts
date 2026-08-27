/**
 * Catalog-link chore → {@link CompoundRowView}. Pure; no React, no hooks.
 */

import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { firstNote } from '@/components/tables/compound/compound-row-model';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export function catalogLinkCompoundView(row: CatalogLinkChoreRow): CompoundRowView {
  const platform = sourcePlatformMetaFromLabel(row.accountSource);
  const orders = row.orderCount;

  return {
    id: String(row.id),
    thumbUrl: null,
    title: row.productTitle?.trim() || row.itemNumber,
    note: firstNote([row.sku, orders > 0 ? `${orders} order${orders === 1 ? '' : 's'}` : null]),
    orderId: row.itemNumber,
    tracking: null,
    platformValue: platform.value || null,
    carrier: null,
    stateLabel: 'Unlinked',
    stateTone: 'alert',
    stateTip:
      orders > 0
        ? `${orders} order${orders === 1 ? '' : 's'} blocked until this listing is linked`
        : 'Listing has no catalog SKU',
    amount: null,
    delay: null,
  };
}
