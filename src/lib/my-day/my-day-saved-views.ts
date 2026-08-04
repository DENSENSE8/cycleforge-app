/**
 * Today's saved-view identity — the two inputs `useSavedViews` takes.
 *
 * A saved view is an OPERATOR-defined facet combination. Today's lane strip
 * (All · Do next · Assigned · Needs attention) is the SYSTEM's, so a view
 * named after a lane is the duplication `display/workbench.md` → Tabs vs. saved
 * views bans: the tab already owns that answer, and the two desync the moment
 * the lane's predicate changes. `scope` is in `paramKeys` so a view can pin the
 * lane it was captured in — not so a view can BE a lane.
 *
 * `MY_DAY_SAVED_VIEWS_KEY` keeps the historical `storageKey` shape for call-site
 * parity with the outbound / station keys; nothing writes localStorage any more
 * — it resolves to the `home_today` DB surface through
 * `src/lib/saved-views/surfaces.ts`.
 */

import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';

export const MY_DAY_SAVED_VIEWS_KEY = 'home_today_saved_views';

/**
 * The params that DEFINE a Today view: the lane, the free-text refinement, and
 * the column sort pair.
 *
 * `task` is deliberately absent — it is the operator's current SELECTION, not a
 * facet, and baking one row's id into a shared view would reopen someone else's
 * inspector on a record that may not even be in their feed.
 */
export const MY_DAY_VIEW_PARAMS = [
  'scope',
  'q',
  GRID_COLUMN_SORT_PARAM,
  GRID_COLUMN_DIR_PARAM,
] as const;
