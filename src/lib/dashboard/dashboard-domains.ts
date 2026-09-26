/** Dashboard domain registry — the `/dashboard` axis. */

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

/** `?mode=` values that select the sales (front-desk history) domain. */
const DASHBOARD_SALES_MODES = ['sales', 'pickup', 'repairs'] as const;

/** Wire tokens `?mode=` may carry on `/dashboard` (route-param hygiene). */
const DASHBOARD_MODE_WIRE = [
  'outbound',
  'inbound',
  'receiving',
  'sales',
  'pickup',
  'repairs',
  'search',
] as const;

/** Wire tokens for `/dashboard` hygiene. */
export function parseDashboardModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (DASHBOARD_MODE_WIRE as readonly string[]).includes(v) ? v : null;
}

/** Wire value for the Sales → Repairs L2 child (`RepairTable` history desk). */
export const DASHBOARD_REPAIRS_MODE = 'repairs';

/** Default wire value when opening the sales domain from nav. */
export const DASHBOARD_SALES_MODE = 'sales';

/** Mode-level gate: sales domain shows walk-in transaction data. */
export const DASHBOARD_SALES_PERMISSION = 'walk_in.view';

/**
 * Resolve the active domain from the URL. `receiving` is accepted as a legacy
 * alias for `inbound` (the sidebar pill id leaked into some saved links).
 * `sales` | `pickup` | `repairs` select the front-desk history domain.
 */
export function getDashboardDomainFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): DashboardDomain {
  const raw = String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase();
  if (raw === DASHBOARD_INBOUND_MODE || raw === 'receiving') return 'inbound';
  if ((DASHBOARD_SALES_MODES as readonly string[]).includes(raw)) return 'sales';
  return 'outbound';
}

/** True when the dashboard URL is the Sales → Repairs history desk. */
export function isDashboardRepairsMode(
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  return (
    String(searchParams.get(DASHBOARD_DOMAIN_PARAM) || '').trim().toLowerCase() ===
    DASHBOARD_REPAIRS_MODE
  );
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

/** True when the URL still carries the retired `?fba` lifecycle tab. */
export function isRetiredFbaView(
  searchParams: Pick<URLSearchParams, 'has'>,
): boolean {
  return searchParams.has('fba');
}

/** Where a retired `?fba` URL goes: */
export function retiredFbaViewTarget(): string {
  return FBA_OUTBOUND_PATH;
}

/** Where a retired `?mode=search` URL goes. */
export function retiredSearchModeTarget(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const openOrderId = String(searchParams.get('openOrderId') || '').trim();
  if (openOrderId) {
    return `/search?sel=order:${encodeURIComponent(openOrderId)}`;
  }
  const q = String(searchParams.get('q') || searchParams.get('dq') || '').trim();
  if (q) return `/search?q=${encodeURIComponent(q)}`;
  return '/shipping/orders';
}

/** Where a retired `/walk-in` history URL goes after Sales folds into the dashboard (`docs/todo/sales-into-dashboard-PLAN.md`). */
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

// The inbound Triage/Unbox tab contract lives with the Docked lane (`components/sidebar/receiving/incoming/inbound-docked-tabs.ts`), which…
