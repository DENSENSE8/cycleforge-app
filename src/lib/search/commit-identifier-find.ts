/** `hrefForPreviewHit` — where a search hit opens. */

import { orderRecordHref, searchHitHref, SKU_RECORD_PATH_PREFIX } from '@/lib/search/search-hit';
import { desktopSearchHref } from '@/lib/search/internal-id';
import { formatSearchSel } from '@/lib/search/search-selection';

/**
 * A hit of a `/search` record kind that opens its own page instead of a
 * `?sel=` record: the SKU arm's hit names its SKU record page
 * (`/inventory?sku=`) — a stock-only SKU has no catalog id for the dossier.
 */
export function hitOpensOwnPage(hit: { entityType: string; href: string }): boolean {
  return hit.entityType === 'sku' && hit.href.startsWith(SKU_RECORD_PATH_PREFIX);
}

export function hrefForPreviewHit(hit: {
  entityType: string;
  id: number;
  href: string;
}): string {
  const raw =
    hit.entityType === 'order'
      ? orderRecordHref(hit.id)
      : hit.entityType === 'receiving'
        ? searchHitHref('RECEIVING', hit.id)
        : hit.entityType === 'unit'
          ? `/search?sel=${formatSearchSel('unit', hit.id)}`
          : hit.href;
  return desktopSearchHref(raw);
}
