/**
 * Picker desk workspace tabs on `/pick`.
 * Param: `?ship=urgent|pending|all|history` — absent defaults to Pending.
 * FBA tab removed 2026-07-29 (IA row L) — FBA owns `/shipping/fba`.
 */

export type ShippingWorkspaceTab = 'urgent' | 'pending' | 'all' | 'history';

const SHIPPING_WORKSPACE_TAB_PARAM = 'ship';

/** Band-1 order — Urgent · Pending · All · History. */
const SHIPPING_WORKSPACE_TABS: readonly ShippingWorkspaceTab[] = [
  'urgent',
  'pending',
  'all',
  'history',
] as const;

const SHIPPING_WORKSPACE_TAB_LABEL: Record<ShippingWorkspaceTab, string> = {
  urgent: 'Urgent',
  pending: 'Pending',
  all: 'All',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(SHIPPING_WORKSPACE_TABS);

/** Raw-string form of {@link getShippingWorkspaceTabFromSearch}, for callers that hold a value rather than a `URLSearchParams` — notably… */
export function parseShippingWorkspaceTab(raw: string | null): ShippingWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as ShippingWorkspaceTab) : 'pending';
}

export function getShippingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): ShippingWorkspaceTab {
  return parseShippingWorkspaceTab(searchParams.get(SHIPPING_WORKSPACE_TAB_PARAM));
}

/** Normalize URL for a shipping workspace tab switch. */
export function normalizeShippingWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: ShippingWorkspaceTab,
): ShippingWorkspaceTab {
  const nextTab = preferredTab ?? getShippingWorkspaceTabFromSearch(params);
  params.delete(SHIPPING_WORKSPACE_TAB_PARAM);

  // Queue facets (dashboard unshipped keys) — only Urgent / Pending keep them.
  if (nextTab !== 'pending' && nextTab !== 'urgent') {
    params.delete('ustatus');
    params.delete('stage');
    params.delete('late');
    params.delete('surface');
  }

  if (nextTab === 'urgent') {
    params.set('attention', '1');
  } else {
    params.delete('attention');
  }

  if (nextTab === 'pending' || nextTab === 'urgent') {
    params.delete('layout');
  }

  if (nextTab !== 'pending') {
    params.set(SHIPPING_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
