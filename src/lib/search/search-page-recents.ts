/**
 * Cross-entity search re-run href for `/search`.
 *
 * Scope bucket for DB-backed staff recents used to live here as
 * `SEARCH_RECENTS_SCOPE`; header find now uses local `useSearchRecents`.
 */

/** Re-run target for a recent query — the search route with the query applied. */
export function searchRerunHref(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}
