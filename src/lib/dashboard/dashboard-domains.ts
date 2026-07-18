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
 * Pure data + functions (no React) so the page, the sidebar, and surface
 * isolation all read the same domain/mode contract.
 */

type DashboardDomain = 'outbound' | 'inbound';

/**
 * The `/dashboard` **mode** axis (the sidebar L2 rail — SoT
 * `SIDEBAR_PAGE_NAV` dashboard entry). Three modes ride the same `?mode=` param:
 *   • `search`    — global search (`?mode=search`); sidebar shows per-staff recents.
 *   • `receiving` — inbound cartons (`?mode=inbound`, alias `?mode=receiving`);
 *     Triage/Unbox table tabs. Maps onto the `inbound` DOMAIN below.
 *   • `shipping`  — outbound orders (bare / `?unshipped` / `?shipped`). Default.
 *
 * Domain (outbound/inbound — never share a table) is the deeper concept the
 * page/header/warm read; MODE is the sidebar rail's vocabulary. `receiving` mode
 * IS the `inbound` domain, so downstream (InboundView, surface-isolation) keeps
 * reading `?mode=inbound` unchanged.
 */
type DashboardMode = 'search' | 'receiving' | 'shipping';

/** The mode axis rides on `?mode=` (absent = the default Shipping/outbound mode). */
const DASHBOARD_DOMAIN_PARAM = 'mode';

/**
 * Resolve the active sidebar mode from the URL. Mirrors the dashboard
 * `resolveMode` in `sidebar-navigation.ts` (whose id is `outbound` for Shipping).
 */
export function getDashboardModeFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardMode {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  if (raw === 'search') return 'search';
  if (raw === DASHBOARD_INBOUND_MODE || raw === 'receiving') return 'receiving';
  return 'shipping';
}

/** `?mode=` value that selects the inbound (receiving cartons) domain. */
export const DASHBOARD_INBOUND_MODE = 'inbound';

/** Mode-level gate: `/dashboard` is `dashboard.view`, but inbound shows receiving data. */
export const DASHBOARD_INBOUND_PERMISSION = 'receiving.view';

export function getDashboardDomainFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardDomain {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  return raw === DASHBOARD_INBOUND_MODE ? 'inbound' : 'outbound';
}

// The inbound Triage/Unbox tab contract now lives with its view
// (`components/dashboard/receiving/dashboard-receiving-tabs.ts`), which reads the
// `?sort=` axis (HISTORY_SORT_OPTIONS) directly. This module keeps only the
// domain/mode resolvers the page + surface-isolation share.
