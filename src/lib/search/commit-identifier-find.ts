/**
 * `hrefForPreviewHit` — where a search hit opens.
 *
 * This module used to also carry `commitIdentifierFind`, the resolve-then-navigate
 * helper behind the palette's "See all results for …" row. That row is gone —
 * the palette now renders every hit it fetched instead of asking twice — and
 * the helper went with it rather than staying as tested code nothing calls.
 */

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
