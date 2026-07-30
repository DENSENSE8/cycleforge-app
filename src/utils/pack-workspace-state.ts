/**
 * Pack workbench tabs on `/pack` — URL SoT via `?packview=`.
 * Absent param defaults to Queue (ready-to-pack / TESTED board).
 */

export type PackWorkspaceTab = 'queue' | 'history';

const PACK_WORKSPACE_TAB_PARAM = 'packview';

export const PACK_WORKSPACE_TAB_LABEL: Record<PackWorkspaceTab, string> = {
  queue: 'Queue',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(['queue', 'history']);

/**
 * Raw-string form of {@link getPackWorkspaceTabFromSearch}, for callers that hold
 * a value rather than a `URLSearchParams` — notably the `/pack` param spec
 * (`@/lib/routing/query-mode-routes`), which composes this via `paramRoundTrip`
 * so the route contract cannot drift from `VALID`.
 */
export function parsePackWorkspaceTab(raw: string | null): PackWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as PackWorkspaceTab) : 'queue';
}

export function getPackWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): PackWorkspaceTab {
  return parsePackWorkspaceTab(searchParams.get(PACK_WORKSPACE_TAB_PARAM));
}

/**
 * Normalize URL for a pack workbench tab switch.
 * Queue defaults `ustatus=TESTED` (ready-to-pack). History clears fulfillment filters.
 * Omits `packview` when queue (default) so the default URL stays clean.
 */
export function normalizePackWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: PackWorkspaceTab,
): PackWorkspaceTab {
  const nextTab = preferredTab ?? getPackWorkspaceTabFromSearch(params);
  params.delete(PACK_WORKSPACE_TAB_PARAM);

  if (nextTab === 'queue') {
    const ustatus = String(params.get('ustatus') || '')
      .trim()
      .toUpperCase();
    if (ustatus !== 'PENDING' && ustatus !== 'TESTED' && ustatus !== 'BLOCKED') {
      params.set('ustatus', 'TESTED');
    }
    params.delete('stage');
    params.delete('attention');
  } else {
    params.set(PACK_WORKSPACE_TAB_PARAM, 'history');
    params.delete('ustatus');
    params.delete('stage');
    params.delete('attention');
    params.delete('late');
    params.delete('surface');
  }

  return nextTab;
}
