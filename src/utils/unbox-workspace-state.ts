/**
 * Unbox workbench tabs on `/unbox` — URL SoT via `?unboxview=`.
 *
 * **UI vocabulary vs wire vocabulary.** The tab ids here are what the operator
 * reads — `urgent` | `recent` | `queue` | `all` | `history`, matching the house
 * convention every other workbench uses (`labels-workspace-state.ts`: `queue` /
 * `Recent`; Testing: Urgent · … · All · History).
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
 *
 * 2026-08-04: Urgent · All mirror Testing / Shipping Band-1. Urgent owns
 * `?priority_only=1` on the scanned queue (same SoT as Testing Urgent).
 */

export type UnboxWorkspaceTab = 'urgent' | 'recent' | 'queue' | 'all' | 'history';

const UNBOX_VIEW_PARAM = 'unboxview';
const PRIORITY_ONLY_PARAM = 'priority_only';

export const UNBOX_WORKSPACE_TAB_LABEL: Record<UnboxWorkspaceTab, string> = {
  urgent: 'Urgent',
  recent: 'Recent',
  queue: 'Queue',
  all: 'All',
  history: 'History',
};

/**
 * Strip order. Urgent leads (priority work); Recent is the operator's own set;
 * Queue is the station backlog; All is typed cross-inbound triage; History
 * (archive) stays last with a divider.
 */
export const UNBOX_WORKSPACE_TABS: readonly UnboxWorkspaceTab[] = [
  'urgent',
  'recent',
  'queue',
  'all',
  'history',
];

/** UI tab → URL value. `history` is the default and omits the param. */
const TAB_TO_PARAM: Record<UnboxWorkspaceTab, string | null> = {
  urgent: 'urgent',
  recent: 'viewed',
  queue: 'queue',
  all: 'all',
  history: null,
};

/**
 * URL value → UI tab. Anything unrecognized falls through to the default, which
 * is how a stale `?unboxview=recent` (the pre-rename wire value for History)
 * still lands on History with no special case: it was only ever written by hand,
 * because `normalize` omits the param for the default tab.
 */
const PARAM_TO_TAB: Record<string, UnboxWorkspaceTab> = {
  urgent: 'urgent',
  viewed: 'recent',
  queue: 'queue',
  all: 'all',
};

/**
 * KPI canvas still answers Recent · Queue · History feeds. Urgent / All reuse
 * Queue metrics (scanned inbound) rather than inventing a fourth feed.
 */
export function unboxKpiFeedTab(
  tab: UnboxWorkspaceTab,
): 'recent' | 'queue' | 'history' {
  if (tab === 'recent') return 'recent';
  if (tab === 'history') return 'history';
  return 'queue';
}

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
 * `history` omits the param (clean URL); other tabs set `unboxview`.
 * Urgent owns `priority_only=1` (cleared on leave) — mirrors Shipping `attention`.
 * Clears `ukpi` on every tab flip so a Queue priority tile does not bleed into Urgent.
 */
export function normalizeUnboxWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: UnboxWorkspaceTab,
): UnboxWorkspaceTab {
  const nextTab = preferredTab ?? getUnboxWorkspaceTabFromSearch(params);
  const wire = TAB_TO_PARAM[nextTab];
  if (wire == null) params.delete(UNBOX_VIEW_PARAM);
  else params.set(UNBOX_VIEW_PARAM, wire);

  if (nextTab === 'urgent') {
    params.set(PRIORITY_ONLY_PARAM, '1');
  } else {
    params.delete(PRIORITY_ONLY_PARAM);
  }
  // KPI tile filter is tab-scoped; never carry across strips.
  params.delete('ukpi');

  return nextTab;
}
