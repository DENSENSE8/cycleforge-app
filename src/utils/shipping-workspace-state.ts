/**
 * Shipping-mode workspace tabs on `/test` (nested under top-level `?view=`).
 * Param: `?ship=pending|history` — absent defaults to Pending.
 * FBA tab removed 2026-07-29 (IA row L) — FBA owns `/shipping/fba`.
 */

export type ShippingWorkspaceTab = 'pending' | 'history';

export const SHIPPING_WORKSPACE_TAB_PARAM = 'ship';

export const SHIPPING_WORKSPACE_TAB_LABEL: Record<ShippingWorkspaceTab, string> = {
  pending: 'Pending',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(['pending', 'history']);

/**
 * Raw-string form of {@link getShippingWorkspaceTabFromSearch}, for callers that
 * hold a value rather than a `URLSearchParams` — notably the `/test` param spec
 * (`@/lib/routing/query-mode-routes`), which composes this via `paramRoundTrip`
 * so the route contract cannot drift from `VALID`.
 */
export function parseShippingWorkspaceTab(raw: string | null): ShippingWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as ShippingWorkspaceTab) : 'pending';
}

export function getShippingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): ShippingWorkspaceTab {
  return parseShippingWorkspaceTab(searchParams.get(SHIPPING_WORKSPACE_TAB_PARAM));
}

/**
 * Normalize URL for a shipping workspace tab switch.
 * Clears tab-specific filters so they don't bleed across Pending / History.
 * Omits `ship` when pending (default) so the default URL stays clean.
 * Legacy `?ship=fba` normalizes to pending.
 */
export function normalizeShippingWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: ShippingWorkspaceTab,
): ShippingWorkspaceTab {
  const nextTab = preferredTab ?? getShippingWorkspaceTabFromSearch(params);
  params.delete(SHIPPING_WORKSPACE_TAB_PARAM);

  // Pending-only (dashboard unshipped keys)
  if (nextTab !== 'pending') {
    params.delete('ustatus');
    params.delete('stage');
    params.delete('late');
    params.delete('attention');
    params.delete('surface');
  }

  if (nextTab === 'pending') {
    params.delete('layout');
  }

  if (nextTab !== 'pending') {
    params.set(SHIPPING_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
