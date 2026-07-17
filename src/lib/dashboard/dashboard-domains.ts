/**
 * Dashboard domain registry — the `/dashboard` mode axis.
 *
 * The dashboard hosts two **domains**, and they never share a table:
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
 * Facet ids ARE the History sort ids (`HISTORY_SORT_OPTIONS`) — the sort axis
 * is the lifecycle facet, so promoting them to tab ids keeps one SoT for the
 * `?sort=` param, the day-band axis, and the server ORDER BY.
 *
 * Pure data + functions (no React) so the page, the header, and the redirect
 * that lane 05 owns all read the same contract.
 */

import {
  HISTORY_DEFAULT_SORT,
  HISTORY_SORT_OPTIONS,
  normalizeHistorySort,
} from '@/lib/receiving/receiving-modes';

type DashboardDomain = 'outbound' | 'inbound';

/** The domain switch rides on `?mode=` (absent = the default outbound domain). */
const DASHBOARD_DOMAIN_PARAM = 'mode';

/** `?mode=` value that selects the inbound (receiving cartons) domain. */
export const DASHBOARD_INBOUND_MODE = 'inbound';

/** Mode-level gate: `/dashboard` is `dashboard.view`, but inbound shows receiving data. */
export const DASHBOARD_INBOUND_PERMISSION = 'receiving.view';

/**
 * Inbound lifecycle facets, in tab order. `id` is both the tab id and the
 * `?sort=` value; `HISTORY_DEFAULT_SORT` is implicit (dropped from the URL).
 */
export const DASHBOARD_INBOUND_FACETS = HISTORY_SORT_OPTIONS;

/** The implicit default facet — omitted from the URL when active. */
export const DASHBOARD_INBOUND_DEFAULT_FACET = HISTORY_DEFAULT_SORT;

export function getDashboardDomainFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardDomain {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  return raw === DASHBOARD_INBOUND_MODE ? 'inbound' : 'outbound';
}

/** Coerce an arbitrary `?sort=` to a valid inbound facet (default on miss). */
export function normalizeDashboardInboundFacet(raw: string | null | undefined): string {
  return normalizeHistorySort(raw);
}

// The mode entry + the `/receiving/history` → inbound redirect (an href builder
// and the param-clearing domain switch) are lane 05's rows — see
// `docs/todo/foh-boh-surface-split/05-nav-permission-redirects.md` P5. They land
// with their call sites; this module deliberately stays at what's wired today.
