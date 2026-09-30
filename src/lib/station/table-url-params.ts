/** Station-table URL contract (station-table-unification-plan §6) — the SoT for the shared params every station/history table reads: */

import {
  DOCKED_DATE_FROM_PARAM,
  DOCKED_DATE_TO_PARAM,
  DOCKED_FLAG_PARAM,
  DOCKED_KIND_PARAM,
  INBOUND_FIND_PARAM,
  INBOUND_SOURCE_PARAM,
} from '@/lib/receiving/inbound-lane';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';
import { REPAIR_CHANNEL_PARAM } from '@/lib/repair/repair-channel';
import { REPAIR_SORT_PARAM } from '@/lib/repair/repair-sort';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';

/**
 * Canonical URL param for the universal all-staff ↔ single-staff filter
 * (P1-WORK-02). One key, one convention, every mode. Absent / blank / 0 = ALL
 * staff (the default behavior of every mode). A positive integer = one staff.
 * Lives here with its parser, not in `useStaffFilter` ('use client'), so server
 * code reads a string and calls a function, never a client reference.
 */
export const STAFF_FILTER_PARAM = 'staff';

/** A `?staff=` value as one staff id; anything else is ALL staff (null). */
export function parseStaffParam(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
  | 'testing_history'
  | 'repair_queue';

/**
 * Per-surface saved-view param keys (§6.3). A saved view captures ONLY the
 * filter/layout params for that surface. Search text (`q`, `rh_*`) stays out
 * (user decision #8), EXCEPT the Inbound desk's sidebar Find (`?find=`): the
 * sidebar port's approved plan (2026-09-27) has a saved view carry it.
 */
export const SAVED_VIEW_PARAM_KEYS: Record<StationSurfaceKey, readonly string[]> = {
  tech_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM],
  packer_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM],
  // Exactly what the Docked ledger reads (`/incoming?lane=docked`, Unbox History):
  // server axis `sort`, the ledger's column sort, the week, who handled it, the
  // attention pills and intake kind, the desk Find. Server search (`rh_*`) stays out.
  receiving_history: [
    LAYOUT_PARAM,
    STAFF_FILTER_PARAM,
    WEEK_OFFSET_PARAM,
    'sort',
    GRID_COLUMN_SORT_PARAM,
    GRID_COLUMN_DIR_PARAM,
    DOCKED_FLAG_PARAM,
    DOCKED_KIND_PARAM,
    DOCKED_DATE_FROM_PARAM,
    DOCKED_DATE_TO_PARAM,
    INBOUND_FIND_PARAM,
  ],
  // Exactly what On the way reads (`/incoming`, `useReceivingModeContext` +
  // the ledger's column sort): delivery state, server order, PO date range,
  // purchasing source, the desk Find. The pasted list (`ref_in`) and `page` stay out.
  receiving_incoming: [
    LAYOUT_PARAM,
    'state',
    'sort',
    'po_from',
    'po_to',
    INBOUND_SOURCE_PARAM,
    GRID_COLUMN_SORT_PARAM,
    GRID_COLUMN_DIR_PARAM,
    INBOUND_FIND_PARAM,
  ],
  testing_history: [LAYOUT_PARAM, SCOPE_PARAM, STAFF_FILTER_PARAM, WEEK_OFFSET_PARAM, 'view'],
  // The repair cards (`/repair`, Sales › Repair service): Status (`tab`), the
  // channel view, Sort, the status chips and the sidebar Find — the owner's
  // 2026-09-29 list. The open record (`openRepair`) and `page` stay out.
  repair_queue: ['tab', REPAIR_CHANNEL_PARAM, REPAIR_SORT_PARAM, REPAIR_STATUS_CHIP_PARAM, 'search'],
};

/** localStorage key holding a surface's saved views. */
export const SAVED_VIEW_STORAGE_KEY: Record<StationSurfaceKey, string> = {
  tech_history: 'tech_history_saved_views',
  packer_history: 'packer_history_saved_views',
  receiving_history: 'receiving_history_saved_views',
  receiving_incoming: 'receiving_incoming_saved_views',
  testing_history: 'testing_history_saved_views',
  repair_queue: 'repair_queue_saved_views',
};
