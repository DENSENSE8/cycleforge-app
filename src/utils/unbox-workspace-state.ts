/**
 * Unbox workbench tabs on `/unbox` — URL SoT via `?unboxview=`.
 *
 * **UI vocabulary vs wire vocabulary.** The tab ids here are what the operator
 * reads — `recent` | `queue` | `history`, matching the house convention every
 * other workbench uses (`labels-workspace-state.ts`: `queue` / `Recent`;
 * `labels-view.ts`: `Products` / `Recent` / `History`, where Recent and History
 * are distinct tabs and Recent comes first).
 *
 * They deliberately do NOT all match the wire. `?unboxview=viewed` still carries
 * the Recent tab because `viewed` is the SERVER-side name for that feed — the
 * `view=viewed` API view, the `unbox_viewed` mode descriptor, and the
 * `receiving_line_views` table it reads. Renaming the wire would rename an API
 * contract to fix a label, and break every live link. The map below is the one
 * seam between the two vocabularies; keep it here rather than spreading
 * `=== 'viewed'` comparisons back through the UI.
 *
 * Before 2026-08-01 this file called the tabs `recent` | `queue` | `viewed`
 * with `recent` LABELLED "History" — so `recent` meant History and `viewed`
 * meant recent, exactly backwards from the rest of the codebase.
 */

export type UnboxWorkspaceTab = 'recent' | 'queue' | 'history';

const UNBOX_VIEW_PARAM = 'unboxview';

export const UNBOX_WORKSPACE_TAB_LABEL: Record<UnboxWorkspaceTab, string> = {
  recent: 'Recent',
  queue: 'Queue',
  history: 'History',
};

/**
 * Strip order. **Recent leads** — it is the operator's own working set, the
 * shortest list, and the one they return to; Labels puts its recents tab first
 * for the same reason. History (the full archive) stays last.
 */
export const UNBOX_WORKSPACE_TABS: readonly UnboxWorkspaceTab[] = [
  'recent',
  'queue',
  'history',
];

/** UI tab → URL value. `history` is the default and omits the param. */
const TAB_TO_PARAM: Record<UnboxWorkspaceTab, string | null> = {
  recent: 'viewed',
  queue: 'queue',
  history: null,
};

/**
 * URL value → UI tab. Anything unrecognized falls through to the default, which
 * is how a stale `?unboxview=recent` (the pre-rename wire value for History)
 * still lands on History with no special case: it was only ever written by hand,
 * because `normalize` omits the param for the default tab.
 */
const PARAM_TO_TAB: Record<string, UnboxWorkspaceTab> = {
  viewed: 'recent',
  queue: 'queue',
};

export function getUnboxWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): UnboxWorkspaceTab {
  const raw = String(searchParams.get(UNBOX_VIEW_PARAM) || '')
    .trim()
    .toLowerCase();
  return PARAM_TO_TAB[raw] ?? 'history';
}

/**
 * Normalize URL state for an Unbox workbench tab switch.
 * `history` omits the param (clean URL); recent/queue set `unboxview`.
 */
export function normalizeUnboxWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: UnboxWorkspaceTab,
): UnboxWorkspaceTab {
  const nextTab = preferredTab ?? getUnboxWorkspaceTabFromSearch(params);
  const wire = TAB_TO_PARAM[nextTab];
  if (wire == null) params.delete(UNBOX_VIEW_PARAM);
  else params.set(UNBOX_VIEW_PARAM, wire);
  return nextTab;
}
