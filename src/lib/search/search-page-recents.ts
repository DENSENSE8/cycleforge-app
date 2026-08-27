/**
 * Cross-entity search re-run href for `/search`.
 *
 * Scope bucket for DB-backed staff recents used to live here as
 * `SEARCH_RECENTS_SCOPE`; header find now uses local `useSearchRecents`.
 */

import { desktopSearchHref } from '@/lib/search/internal-id';

/** Bare `/search` — recents landing (no query, no selection). */
export const SEARCH_RECENTS_PAGE_HREF = '/search';

/** Re-run target for a recent query — the search route with the query applied. */
export function searchRerunHref(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}

/**
 * Open a recent from the search workbench. Entity hits remap off `/m/`;
 * typed queries re-run on `/search?q=`.
 */
export function desktopRecentOpenHref(entry: {
  query: string;
  topHit?: { href?: string } | null;
}): string {
  const hit = String(entry.topHit?.href ?? '').trim();
  if (hit) return desktopSearchHref(hit);
  return searchRerunHref(entry.query);
}
