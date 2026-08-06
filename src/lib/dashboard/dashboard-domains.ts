/**
 * Dashboard domain registry — the `/dashboard` axis.
 *
 * ONE axis, ONE name: **domain**. The dashboard hosts three, and they never share
 * a table:
 *   • `outbound` — sales orders leaving the building (Pending · Packed ·
 *     Shipped lifecycle tabs, bare presence params `?unshipped` / `?shipped`).
 *   • `inbound`  — receiving cartons arriving at the dock (Unboxed · Scanned
 *     history facets). Its rows are receiving lines, NOT orders.
 *   • `sales`    — front-desk transaction history (Sales · Local Pickup feeds).
 *     Wire values `?mode=sales` | `?mode=pickup` (pickup is the Local Pickup
 *     history sub-mode; both belong to this domain). Counter intake stays on
 *     `/pickup` + `/repair`.
 *
 * Inbound is a distinct `?mode=inbound` switch rather than a fourth outbound
 * lifecycle tab precisely so the two never intermix — see
 * `docs/todo/foh-boh-surface-split/04-inbound-history-dashboard-mode.md`
 * ("keep inbound cartons in their own domain switch"). Sales joined the same
 * way (`docs/todo/sales-into-dashboard-PLAN.md`).
 *
 * **"Mode" is no longer a second word for this.** The page used to carry a
 * parallel `DashboardMode` ('search' | 'receiving' | 'shipping') whose three
 * values mapped onto two domains plus a surface that was not a domain at all —
 * so `receiving` mode *was* `inbound` domain and every reader had to know which
 * vocabulary it was in. Search left the axis entirely for `/search`
 * (`docs/todo/dashboard-ia-rework-PLAN.md` Phases 1–2), which is what let the
 * axis collapse; Sales later folded in as the third domain.
 *
 * The WIRE value stays `?mode=inbound` (bookmarks, surface-isolation, the
 * `dashboard-inbound-mode` e2e spec) — renaming the param buys nothing and
 * breaks every saved link. The sidebar rail keeps its own pill ids
 * (`receiving` / `outbound` / `sales` / `pickup`) in `SIDEBAR_PAGE_NAV`; those
 * are labels, not a second model.
 *
 * Pure data + functions (no React) so the page, the sidebar, and surface
 * isolation all read the same domain contract.
 */

import { FBA_OUTBOUND_PATH } from '@/lib/fba/fba-modes';
import {
  defaultTabForMode,
  parseWalkInHistoryMode,
  type WalkInHistoryMode,
} from '@/lib/walk-in/history-modes';

type DashboardDomain = 'outbound' | 'inbound' | 'sales';

/** The domain axis rides on `?mode=` (absent = the default outbound domain). */
const DASHBOARD_DOMAIN_PARAM = 'mode';

/** `?mode=` value that selects the inbound (receiving cartons) domain. */
export const DASHBOARD_INBOUND_MODE = 'inbound';

/**
 * `?mode=` values that select the sales (front-desk history) domain.
 * `sales` is the default history feed; `pickup` is Local Pickup history —
 * both mount {@link DashboardSalesView} and never share a table with orders.
 */
const DASHBOARD_SALES_MODES = ['sales', 'pickup'] as const;

/** Default wire value when opening the sales domain from nav. */
export const DASHBOARD_SALES_MODE = 'sales';

/** Mode-level gate: sales domain shows walk-in transaction data. */
export const DASHBOARD_SALES_PERMISSION = 'walk_in.view';

/**
 * Resolve the active domain from the URL. `receiving` is accepted as a legacy
 * alias for `inbound` (the sidebar pill id leaked into some saved links).
 * `sales` | `pickup` select the front-desk history domain.
 */
export function getDashboardDomainFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardDomain {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  if (raw === DASHBOARD_INBOUND_MODE || raw === 'receiving') return 'inbound';
  if ((DASHBOARD_SALES_MODES as readonly string[]).includes(raw)) return 'sales';
  return 'outbound';
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
 * True when the URL still carries the retired `?fba` lifecycle tab.
 *
 * Row L of the IA rework deleted `'fba'` from `DashboardOrderView` because FBA
 * fails the top-axis predicate — it already owns `/shipping/fba`. Deleting the
 * member alone made an old `?fba` bookmark fall THROUGH to the Pending tab, which
 * is neither of the two outcomes the plan weighed ("Shipping mode vs. 404") and
 * silently discards what the operator asked for. So `?fba` joins `?warranty=` and
 * `?mode=search` as a client-redirected retired front door — the established
 * mechanism for exactly this, and for the same reason: Next `redirects()` emits a
 * permanently-cached 308 and cannot drop one param while preserving others.
 */
export function isRetiredFbaView(
  searchParams: Pick<URLSearchParams, 'has'>,
): boolean {
  return searchParams.has('fba');
}

/**
 * Where a retired `?fba` URL goes: FBA's real home.
 *
 * Carries nothing across. The dashboard's `?open=` is an ORDER id and the FBA
 * board's `openShipmentId` is a SHIPMENT id — forwarding one as the other would
 * focus an unrelated record, which is worse than opening clean.
 */
export function retiredFbaViewTarget(): string {
  return FBA_OUTBOUND_PATH;
}

/**
 * Where a retired `?mode=search` URL goes.
 *   • `openOrderId` → that order's one shell, `/o/[id]`.
 *   • `q`           → the cross-entity search route.
 *   • bare          → To-ship desk (`/shipping/orders`; was `/dashboard` outbound).
 */
export function retiredSearchModeTarget(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const openOrderId = String(searchParams.get('openOrderId') || '').trim();
  if (openOrderId) return `/o/${encodeURIComponent(openOrderId)}`;
  const q = String(searchParams.get('q') || searchParams.get('dq') || '').trim();
  if (q) return `/search?q=${encodeURIComponent(q)}`;
  return '/shipping/orders';
}

/**
 * Where a retired `/walk-in` history URL goes after Sales folds into the
 * dashboard (`docs/todo/sales-into-dashboard-PLAN.md`).
 *
 * Preserves Local Pickup vs Sales (`?mode=` / legacy `?category=`) and a
 * non-default history `?tab=`. Intake deep-links (`?new=` / `?openRepair=`) are
 * handled first by `useWalkInTaskRedirect` and never reach this helper.
 */
export function retiredWalkInHistoryTarget(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const modeRaw = searchParams.get('mode') ?? searchParams.get('category');
  const historyMode: WalkInHistoryMode = parseWalkInHistoryMode(modeRaw);
  const params = new URLSearchParams();
  params.set(DASHBOARD_DOMAIN_PARAM, historyMode);
  const tab = String(searchParams.get('tab') || '').trim();
  if (tab && tab !== defaultTabForMode(historyMode)) {
    params.set('tab', tab);
  }
  return `/dashboard?${params.toString()}`;
}

// The inbound Triage/Unbox tab contract lives with the Docked lane
// (`components/sidebar/receiving/incoming/inbound-docked-tabs.ts`), which reads the
// `?sort=` wire axis (`HISTORY_SORT_WIRE_IDS`) directly. That axis is the INBOUND
// desk's Docked server ordering; the outbound display sort is `QueueSortSwitch`'s own
// state and grid COLUMN sort is `?colsort=`/`?coldir=` (`useUrlColumnSort`) —
// three different jobs, three different keys, never overloaded onto one.
