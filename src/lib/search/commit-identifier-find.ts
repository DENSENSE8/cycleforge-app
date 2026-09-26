/** `hrefForPreviewHit` — where a search hit opens. */

import { orderRecordHref, searchHitHref } from '@/lib/search/search-hit';
import { desktopSearchHref } from '@/lib/search/internal-id';
import { formatSearchSel } from '@/lib/search/search-selection';

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
