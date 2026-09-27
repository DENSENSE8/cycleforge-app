/** `/search` durable selection — `?sel=order:123` / `receiving:50200` / … */

import type { SearchHitEntityType } from '@/lib/search/search-hit';

/**
 * The entity types `/search` opens as a record (`SearchDossier`). Tickets,
 * warranty claims and bins are search HITS, not records here: they hand off
 * to their own desk (`searchHitHref`) instead of a `?sel=` dead end.
 */
const SEARCH_RECORD_TYPES = ['order', 'unit', 'receiving', 'sku', 'repair', 'fba'] as const;

export type SearchRecordType = (typeof SEARCH_RECORD_TYPES)[number];

export function isSearchRecordType(value: string): value is SearchRecordType {
  return (SEARCH_RECORD_TYPES as readonly string[]).includes(value);
}

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
  if (!isSearchRecordType(entityType)) return null;
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
 * Sole-hit selection key: exactly one usable hit that `/search` opens as a
 * record. Returns the `sel` value, or null.
 */
export function soleHitSel(
  hits: ReadonlyArray<{ id: number; entityType: string }>,
): string | null {
  if (hits.length !== 1) return null;
  const hit = hits[0];
  if (!hit || !Number.isFinite(hit.id) || hit.id <= 0) return null;
  if (!isSearchRecordType(hit.entityType)) return null;
  return formatSearchSel(hit.entityType, hit.id);
}
