/**
 * Cross-entity search recents — the scope key + re-run href for `/search`'s
 * per-staff recents (DB-backed, `useStaffSearchRecents`).
 *
 * Moved out of `components/dashboard/search/` when Search stopped being a
 * `/dashboard` mode and became its own route (`docs/todo/dashboard-ia-rework-PLAN.md`
 * Phase 1.2). The scope VALUE stays `'dashboard'` deliberately: it is the
 * storage bucket every already-saved recent was written under, and renaming it
 * would orphan every operator's history for a cosmetic gain.
 */

/** Scope bucket for cross-entity search recents (kept apart from other surfaces). */
export const SEARCH_RECENTS_SCOPE = 'dashboard';

/** Re-run target for a recent query — the search route with the query applied. */
export function searchRerunHref(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}
