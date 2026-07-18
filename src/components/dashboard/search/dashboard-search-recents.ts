/**
 * Dashboard · Search recents — the scope key + re-run href for the Search mode's
 * per-staff recents (DB-backed, `useStaffSearchRecents`). A recent re-runs by
 * landing back on the Search mode with `?q=`, so `SearchResultsSurface` picks it
 * up exactly as a fresh search would.
 */

/** Scope bucket for Dashboard Search recents (kept apart from other surfaces). */
export const DASHBOARD_SEARCH_RECENTS_SCOPE = 'dashboard';

/** Re-run target for a recent query — the Search mode with the query applied. */
export function dashboardSearchRerunHref(query: string): string {
  return `/dashboard?mode=search&q=${encodeURIComponent(query.trim())}`;
}
