/** Station-table URL contract (station-table-unification-plan §6) — the SoT for the shared params every station/history table reads: */

import { STAFF_FILTER_PARAM } from '@/hooks/useStaffFilter';

export { STAFF_FILTER_PARAM };

/** Pipeline (board) ⇄ All (dense list) view toggle. */
export const LAYOUT_PARAM = 'layout';
/** My work (signed-in) ⇄ All staff scope. */
const SCOPE_PARAM = 'scope';
/** Shared week navigation offset (0 = current week). */
export const WEEK_OFFSET_PARAM = 'weekOffset';

export type StationLayout = 'board' | 'all';
type StationScope = 'mine' | 'all';

const DEFAULT_STATION_LAYOUT: StationLayout = 'all';

export function parseLayout(raw: string | null | undefined): StationLayout {
  return raw === 'board' ? 'board' : 'all';
}

function parseScope(raw: string | null | undefined, fallback: StationScope): StationScope {
  return raw === 'mine' || raw === 'all' ? raw : fallback;
}

export function parseWeekOffset(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** The station surfaces that get a saved-views + ⋮ menu. */
type StationSurfaceKey =
  | 'tech_history'
  | 'packer_history'
  | 'receiving_history'
  | 'receiving_incoming'
  | 'testing_history';

/**
 * Per-surface saved-view param keys (§6.3). A saved view captures ONLY the
 * filter/layout params for that surface — never ephemeral search text (`q`),
 * per user decision #8 (search stays separate).
 */
export const SAVED_VIEW_PARAM_KEYS: Record<StationSurfaceKey, readonly string[]> = {
  tech_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM],
  packer_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM],
  receiving_history: [
    LAYOUT_PARAM,
    SCOPE_PARAM,
    STAFF_FILTER_PARAM,
    'sort',
    'field',
    'historySearchScope',
    'mode',
  ],
  receiving_incoming: [
    LAYOUT_PARAM,
    'incomingState',
    'sort',
    'incomingPoFrom',
    'incomingPoTo',
    'incomingFacet',
  ],
  testing_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM, 'view'],
};

/** localStorage key holding a surface's saved views. */
export const SAVED_VIEW_STORAGE_KEY: Record<StationSurfaceKey, string> = {
  tech_history: 'tech_history_saved_views',
  packer_history: 'packer_history_saved_views',
  receiving_history: 'receiving_history_saved_views',
  receiving_incoming: 'receiving_incoming_saved_views',
  testing_history: 'testing_history_saved_views',
};
