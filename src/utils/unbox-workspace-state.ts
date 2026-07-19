/**
 * Unbox workbench tabs on `/unbox` — URL SoT via `?unboxview=`.
 * Absent param defaults to History (`recent` id kept for URL stability).
 */

export type UnboxWorkspaceTab = 'recent' | 'queue' | 'viewed';

const UNBOX_VIEW_PARAM = 'unboxview';

export const UNBOX_WORKSPACE_TAB_LABEL: Record<UnboxWorkspaceTab, string> = {
  recent: 'History',
  queue: 'Queue',
  viewed: 'Viewed',
};

const VALID: ReadonlySet<string> = new Set(['recent', 'queue', 'viewed']);

export function getUnboxWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): UnboxWorkspaceTab {
  const raw = String(searchParams.get(UNBOX_VIEW_PARAM) || '')
    .trim()
    .toLowerCase();
  return VALID.has(raw) ? (raw as UnboxWorkspaceTab) : 'recent';
}

/**
 * Normalize URL state for an Unbox workbench tab switch.
 * `recent` omits the param (clean URL); queue/viewed set `unboxview`.
 */
export function normalizeUnboxWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: UnboxWorkspaceTab,
): UnboxWorkspaceTab {
  const nextTab = preferredTab ?? getUnboxWorkspaceTabFromSearch(params);
  if (nextTab === 'recent') params.delete(UNBOX_VIEW_PARAM);
  else params.set(UNBOX_VIEW_PARAM, nextTab);
  return nextTab;
}
