/**
 * Shipping-mode workspace tabs on `/test` (nested under top-level `?view=`).
 * Param: `?ship=pending|fba|history` — absent defaults to Pending.
 */

export type ShippingWorkspaceTab = 'pending' | 'fba' | 'history';

export const SHIPPING_WORKSPACE_TAB_PARAM = 'ship';

export const SHIPPING_WORKSPACE_TAB_LABEL: Record<ShippingWorkspaceTab, string> = {
  pending: 'Pending',
  fba: 'FBA',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(['pending', 'fba', 'history']);

export function getShippingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): ShippingWorkspaceTab {
  const raw = String(searchParams.get(SHIPPING_WORKSPACE_TAB_PARAM) || '').trim().toLowerCase();
  return VALID.has(raw) ? (raw as ShippingWorkspaceTab) : 'pending';
}

/**
 * Normalize URL for a shipping workspace tab switch.
 * Clears tab-specific filters so they don't bleed across Pending / FBA / History.
 * Omits `ship` when pending (default) so the default URL stays clean.
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

  // History-only station layout / staff (staff also used on Pending — clear when leaving
  // a tab that doesn't own it so FBA stays clean; Pending/History both use staff)
  if (nextTab === 'fba') {
    params.delete('staff');
    params.delete('layout');
  }
  if (nextTab === 'pending') {
    params.delete('layout');
  }

  if (nextTab !== 'pending') {
    params.set(SHIPPING_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
