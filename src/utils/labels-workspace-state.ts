/**
 * Labels-station workspace tabs on `/shipping` (labels mode, nested under the
 * sidebar `?mode=`). Param: `?ltab=queue|recent` — absent defaults to Queue.
 * Mirrors `shipping-workspace-state.ts` (the golden lifecycle-facet tab SoT).
 */

export type LabelsWorkspaceTab = 'queue' | 'recent';

const LABELS_WORKSPACE_TAB_PARAM = 'ltab';

export const LABELS_WORKSPACE_TAB_LABEL: Record<LabelsWorkspaceTab, string> = {
  queue: 'Queue',
  recent: 'Recent',
};

const VALID: ReadonlySet<string> = new Set(['queue', 'recent']);

export function getLabelsWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): LabelsWorkspaceTab {
  const raw = String(searchParams.get(LABELS_WORKSPACE_TAB_PARAM) || '').trim().toLowerCase();
  return VALID.has(raw) ? (raw as LabelsWorkspaceTab) : 'queue';
}

/**
 * Normalize URL for a labels workspace tab switch. Clears the open-order label
 * flow (`open`) so a selection from Queue doesn't bleed into Recent, and omits
 * `ltab` when Queue (default) so the default URL stays clean.
 */
export function normalizeLabelsWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: LabelsWorkspaceTab,
): LabelsWorkspaceTab {
  const nextTab = preferredTab ?? getLabelsWorkspaceTabFromSearch(params);
  params.delete(LABELS_WORKSPACE_TAB_PARAM);
  // The open-order print/attach flow belongs to the Queue tab; clear it on switch.
  params.delete('open');

  if (nextTab !== 'queue') {
    params.set(LABELS_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
