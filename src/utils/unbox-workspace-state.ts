/** Unbox workbench tabs on `/unbox` — URL SoT via `?unboxview=`. */

export type UnboxWorkspaceTab =
  | 'incoming'
  | 'queue'
  | 'recent'
  | 'history'
  /** Not in the strip — deep-link only, pending the Refine ruling. */
  | 'all';

const UNBOX_VIEW_PARAM = 'unboxview';
const PRIORITY_ONLY_PARAM = 'priority_only';

export const UNBOX_WORKSPACE_TAB_LABEL: Record<UnboxWorkspaceTab, string> = {
  incoming: 'Inbound',
  queue: 'Queue',
  recent: 'Recent',
  history: 'History',
  all: 'All',
};

/** System strip order — the carton's own path, left to right. */
export const UNBOX_WORKSPACE_TABS: readonly UnboxWorkspaceTab[] = [
  'incoming',
  'queue',
  'recent',
  'history',
];

/** UI tab → URL value. `queue` is the default and omits the param. */
const TAB_TO_PARAM: Record<UnboxWorkspaceTab, string | null> = {
  incoming: 'incoming',
  queue: null,
  recent: 'viewed',
  history: 'history',
  all: 'all',
};

/** URL value → UI tab. */
const PARAM_TO_TAB: Record<string, UnboxWorkspaceTab> = {
  incoming: 'incoming',
  queue: 'queue',
  viewed: 'recent',
  history: 'history',
  all: 'all',
  urgent: 'queue',
};

/** Wire values `?unboxview=` may carry (for route-param hygiene). */
export function parseUnboxViewWire(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (key in PARAM_TO_TAB) return key;
  // Pre-2026-08-01 History wire — never written by the app now, but kept so a
  // hand-typed link is not silently deleted by hygiene before the reader runs.
  if (key === 'recent') return key;
  return null;
}

/**
 * KPI canvas answers Recent · Queue · History feeds. Inbound / All reuse Queue
 * metrics (scanned inbound) rather than inventing a fourth feed.
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
  return PARAM_TO_TAB[raw] ?? 'queue';
}

/** Normalize URL state for an Unbox workbench tab switch. */
export function normalizeUnboxWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: UnboxWorkspaceTab,
): UnboxWorkspaceTab {
  const nextTab = preferredTab ?? getUnboxWorkspaceTabFromSearch(params);
  const wire = TAB_TO_PARAM[nextTab];
  if (wire == null) params.delete(UNBOX_VIEW_PARAM);
  else params.set(UNBOX_VIEW_PARAM, wire);

  params.delete(PRIORITY_ONLY_PARAM);
  // KPI tile filter is tab-scoped; never carry across strips.
  params.delete('ukpi');

  return nextTab;
}
