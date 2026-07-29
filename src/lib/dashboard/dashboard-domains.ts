/**
 * Dashboard domain registry — the `/dashboard` axis.
 *
 * ONE axis, ONE name: **domain**. The dashboard hosts two, and they never share
 * a table:
 *   • `outbound` — sales orders leaving the building (Pending · Packed ·
 *     Shipped lifecycle tabs, bare presence params `?unshipped` / `?shipped`).
 *   • `inbound`  — receiving cartons arriving at the dock (Unboxed · Scanned
 *     history facets). Its rows are receiving lines, NOT orders.
 *
 * Inbound is a distinct `?mode=inbound` switch rather than a fourth outbound
 * lifecycle tab precisely so the two never intermix — see
 * `docs/todo/foh-boh-surface-split/04-inbound-history-dashboard-mode.md`
 * ("keep inbound cartons in their own domain switch").
 *
 * **"Mode" is no longer a second word for this.** The page used to carry a
 * parallel `DashboardMode` ('search' | 'receiving' | 'shipping') whose three
 * values mapped onto two domains plus a surface that was not a domain at all —
 * so `receiving` mode *was* `inbound` domain and every reader had to know which
 * vocabulary it was in. Search left the axis entirely for `/search`
 * (`docs/todo/dashboard-ia-rework-PLAN.md` Phases 1–2), which is what let the
 * axis collapse to exactly two values.
 *
 * The WIRE value stays `?mode=inbound` (bookmarks, surface-isolation, the
 * `dashboard-inbound-mode` e2e spec) — renaming the param buys nothing and
 * breaks every saved link. The sidebar rail keeps its own pill ids
 * (`receiving` / `outbound`) in `SIDEBAR_PAGE_NAV`; those are labels, not a
 * second model.
 *
 * Pure data + functions (no React) so the page, the sidebar, and surface
 * isolation all read the same domain contract.
 */

export type DashboardDomain = 'outbound' | 'inbound';

/** The domain axis rides on `?mode=` (absent = the default outbound domain). */
const DASHBOARD_DOMAIN_PARAM = 'mode';

/** `?mode=` value that selects the inbound (receiving cartons) domain. */
export const DASHBOARD_INBOUND_MODE = 'inbound';

/** Mode-level gate: `/dashboard` is `dashboard.view`, but inbound shows receiving data. */
export const DASHBOARD_INBOUND_PERMISSION = 'receiving.view';

/**
 * Resolve the active domain from the URL. `receiving` is accepted as a legacy
 * alias for `inbound` (the sidebar pill id leaked into some saved links).
 */
export function getDashboardDomainFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardDomain {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  return raw === DASHBOARD_INBOUND_MODE || raw === 'receiving' ? 'inbound' : 'outbound';
}

/**
 * True when the URL still carries the retired Search mode. `/dashboard` client-
 * redirects these (the `?warranty=` → `/support` precedent); Next `redirects()`
 * emits 308 and cannot cleanly drop one param while preserving `q`.
 */
export function isRetiredSearchMode(
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  return String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase() === 'search';
}

/**
 * Where a retired `?mode=search` URL goes.
 *   • `openOrderId` → that order's one shell, `/o/[id]`.
 *   • `q`           → the cross-entity search route.
 *   • bare          → the dashboard's default domain.
 */
export function retiredSearchModeTarget(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const openOrderId = String(searchParams.get('openOrderId') || '').trim();
  if (openOrderId) return `/o/${encodeURIComponent(openOrderId)}`;
  const q = String(searchParams.get('q') || searchParams.get('dq') || '').trim();
  if (q) return `/search?q=${encodeURIComponent(q)}`;
  return '/dashboard';
}

// The inbound Triage/Unbox tab contract lives with its view
// (`components/dashboard/receiving/dashboard-receiving-tabs.ts`), which reads the
// `?sort=` axis (HISTORY_SORT_OPTIONS) directly. That axis is the INBOUND
// domain's server ordering; the outbound display sort is `QueueSortSwitch`'s own
// state and grid COLUMN sort is `?colsort=`/`?coldir=` (`useUrlColumnSort`) —
// three different jobs, three different keys, never overloaded onto one.
