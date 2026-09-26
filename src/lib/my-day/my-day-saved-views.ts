/** Today's saved-view identity — the two inputs `useSavedViews` takes. */

import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';

export const MY_DAY_SAVED_VIEWS_KEY = 'home_today_saved_views';

/** The params that DEFINE a Today view: */
const MY_DAY_VIEW_PARAMS = [
  'scope',
  'q',
  GRID_COLUMN_SORT_PARAM,
  GRID_COLUMN_DIR_PARAM,
] as const;
