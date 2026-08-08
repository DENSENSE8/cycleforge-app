/**
 * Unbox workbench tabs on `/unbox` — URL SoT via `?unboxview=`.
 *
 * **UI vocabulary vs wire vocabulary.** The tab ids here are what the operator
 * reads — `urgent` | `recent` | `queue` | `all` | `history` | `incoming`,
 * matching the house convention every other workbench uses
 * (`labels-workspace-state.ts`: `queue` / `Recent`; Testing: Urgent · … · All ·
 * History).
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
 *
 * 2026-08-07: `incoming` is a catalog-pinned extra tab (Plus → pin Inbound), not
 * in {@link UNBOX_WORKSPACE_TABS}. Deep link `?unboxview=incoming` always works.
 *
 * **2026-08-08 — the band is now ordered by PROCESS, and `Urgent` is gone.**
 * The strip reads `Inbound · Queue · Recent · History`: where a carton comes
 * from, the work in front of you, what you have touched, the archive. It is no
 * longer ordered by urgency-then-ownership, and the two members that were never
 * stages have left:
 *
 * • **Urgent was a filter wearing a tab's clothes** — the Queue descriptor plus
 *   `?priority_only=1`, which is why leaving it had to *clear* a param. Urgency
 *   is not a place a carton sits; it is a flag a carton can carry at any stage.
 *   It is now a pinned band at the top of the queue rows, so an urgent carton is
 *   visible from the tab you are already on instead of behind a tab you have to
 *   remember to check. `?unboxview=urgent` therefore resolves to `queue` — the
 *   queue with urgent on top is a superset of what that link used to open, so no
 *   live link loses its meaning.
 * • **`incoming` is promoted from pinned extra to the FIRST system tab.** It is
 *   the upstream stage, so it leads. It no longer rides the
 *   `unboxPinnedExtraTabs` machinery, and it is no longer appended at the far
 *   right — which had it sitting after the archive, downstream of everything, at
 *   the opposite end of the band from the stage it represents.
 *
 * **The default moved from `history` to `queue`.** A process-ordered strip that
 * opened on its own last tab was incoherent: you arrive at the bench to work,
 * and the bench queue is the work. Bare `/unbox` now means the queue, so
 * `history` takes an explicit wire value for the first time. One knock-on worth
 * knowing: a hand-written stale `?unboxview=recent` (the pre-2026-08-01 wire
 * value for History) used to fall through to History and now falls through to
 * Queue. Those were only ever hand-typed — `normalize` omits the param for the
 * default — so nothing generated is affected.
 *
 * `all` is NOT in the strip but survives in the vocabulary: it mounts a
 * different component (`TechAllTriageTable`), not a filtered view of this table,
 * so it cannot simply become a Refine option the way Urgent became a pin. Its
 * home is an open ruling; the deep link keeps working until that lands.
 */

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

/**
 * System strip order — the carton's own path, left to right. Inbound is where it
 * comes from, Queue is the work in front of you, Recent is what you have
 * touched, History is the archive.
 *
 * Recent sits between Queue and History deliberately: it is not a stage, but it
 * is a *looking back* surface, so it belongs with the archive rather than
 * splitting the two live stages apart.
 *
 * `all` is absent by ruling and `urgent` no longer exists as a tab — see the
 * file docblock. There are no catalog-pinned extras appended after this list any
 * more; Inbound was the only one and it is a system tab now.
 */
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

/**
 * URL value → UI tab. Anything unrecognized falls through to the default.
 *
 * `urgent` is a MIGRATION, not a tab: the queue with urgent pinned to the top is
 * a superset of what `?unboxview=urgent` used to open, so an old link keeps
 * showing the operator everything it showed them before. `queue` stays listed
 * even though it is the default and `normalize` omits it, because a hand-written
 * `?unboxview=queue` should resolve rather than fall through by luck.
 */
const PARAM_TO_TAB: Record<string, UnboxWorkspaceTab> = {
  incoming: 'incoming',
  queue: 'queue',
  viewed: 'recent',
  history: 'history',
  all: 'all',
  urgent: 'queue',
};

/**
 * Wire values `?unboxview=` may carry (for route-param hygiene).
 *
 * Returns the trimmed lowercase token unchanged when known — including migrations
 * (`urgent`) and the pre-rename legacy (`recent`) — so
 * `useSurfaceParamHygiene` does not strip a live tab mid-flight. Tab *resolution*
 * still lives in {@link getUnboxWorkspaceTabFromSearch} (legacy `recent` → Queue).
 *
 * Never re-type this list in `UNBOX_ROUTE_PARAMS`; round-trip through here.
 */
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

/**
 * Normalize URL state for an Unbox workbench tab switch.
 * `queue` omits the param (clean URL); other tabs set `unboxview`.
 *
 * `priority_only` is cleared unconditionally. No tab owns it any more — urgency
 * is a pinned band at the top of the queue rows rather than a filtered list — so
 * a leftover `?priority_only=1` from an old link would silently hide every
 * non-urgent carton on a tab whose chrome gives no hint that it is filtered.
 * Clears `ukpi` on every tab flip so one tab's KPI tile filter cannot bleed into
 * the next.
 */
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
