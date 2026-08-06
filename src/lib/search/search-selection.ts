/**
 * `/search` durable selection — `?sel=order:123` / `receiving:50200` / …
 *
 * Header find / browse shell writes this param; the page swaps to full-bleed
 * entity detail. Sole/exact identifier hits write `sel` in-page instead of
 * navigating to `searchHitHref`.
 */

import {
  isUiEntityType,
  type SearchHitEntityType,
} from '@/lib/search/search-hit';

export const SEARCH_SEL_PARAM = 'sel';

export type SearchSelection = {
  entityType: SearchHitEntityType;
  id: number;
};

/** Serialize a selection for the URL (`order:123`). */
export function formatSearchSel(entityType: SearchHitEntityType, id: number): string {
  return `${entityType}:${id}`;
}

/** Parse `?sel=` — null when missing, malformed, or an unknown vocabulary. */
export function parseSearchSel(raw: string | null | undefined): SearchSelection | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const colon = trimmed.indexOf(':');
  if (colon <= 0) return null;
  const entityType = trimmed.slice(0, colon);
  const idStr = trimmed.slice(colon + 1);
  if (!isUiEntityType(entityType)) return null;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { entityType, id };
}

/** True when `sel` points at this hit. */
export function isSearchSelActive(
  sel: SearchSelection | null,
  hit: { entityType: string; id: number },
): boolean {
  if (!sel) return false;
  return sel.entityType === hit.entityType && sel.id === hit.id;
}

/**
 * Sole-hit selection key — same gate as {@link soleHitHref}: exactly one usable
 * hit of a known UI entity type. Returns the `sel` value, or null.
 */
export function soleHitSel(
  hits: ReadonlyArray<{ id: number; entityType: string }>,
): string | null {
  if (hits.length !== 1) return null;
  const hit = hits[0];
  if (!hit || !Number.isFinite(hit.id) || hit.id <= 0) return null;
  if (!isUiEntityType(hit.entityType)) return null;
  return formatSearchSel(hit.entityType, hit.id);
}
