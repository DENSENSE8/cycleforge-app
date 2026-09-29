/** Inbound desk lane — Pipeline (on the way), Docked (landed activity), Exceptions (needs a person). */

import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { HISTORY_SORT_WIRE_IDS } from '@/lib/receiving/receiving-modes';

export type InboundLane = 'pipeline' | 'docked' | 'exceptions';

const INBOUND_LANE_PARAM = 'lane';

/** Wire values; Pipeline omits the param. */
const INBOUND_LANE_WIRE = ['docked', 'exceptions'] as const;

/** `?lane=` values the route hygiene keeps (`INCOMING_ROUTE_PARAMS`). */
export const INBOUND_LANE_PARAM_VALUES = ['pipeline', ...INBOUND_LANE_WIRE] as const;

const PIPELINE_SORT_IDS = [
  'zoho_newest',
  'zoho_oldest',
  'expected_soonest',
  'recently_added',
] as const;

const HISTORY_SORT_IDS = HISTORY_SORT_WIRE_IDS;

/** Params that belong only to the Pipeline lane. */
const PIPELINE_ONLY_PARAMS = [
  'incview',
  'tracking_in',
  'state',
  'inbound',
  'po_from',
  'po_to',
] as const;

/**
 * The Pipeline's purchasing-source filter (`?inbound=`) — the accounts the
 * list endpoint narrows on (`useReceivingModeContext` honours only these).
 * Absent = every source.
 */
export const INBOUND_SOURCE_PARAM = 'inbound';
export const INBOUND_SOURCE_OPTIONS = [
  { value: 'zoho', label: 'Zoho' },
  { value: 'ebay', label: 'eBay' },
] as const;

/**
 * The Inbound desk's Find text (the sidebar `NavFind`, both lanes) — narrows
 * the loaded rows in place (`receivingLineMatchesQuery`). In the URL so a
 * reload, a shared link and a saved view keep it. Distinct from `rh_q`, which
 * is the SERVER search (PO-field on On the way) the list fetch sends.
 */
export const INBOUND_FIND_PARAM = 'find';

/**
 * A pasted list belongs to the lane it was pasted on: On the way reconciles
 * it, Unboxed narrows to it. A lane switch drops it; Exceptions never carries one.
 */
const PASTE_PARAMS = ['ref_in', 'recon', 'recon_reason'] as const;

/**
 * Unboxed status pills (`dockedCartonStatuses(rows)`: UNFOUND · CLAIM · SHORT
 * · UNBOXED, comma-separated) — narrow the loaded list to those cartons in
 * place. In the URL so a saved view and a shared link keep the cut.
 */
export const DOCKED_FLAG_PARAM = 'dflag';

/** Unboxed intake-kind filter (`dockedIntakeKind(row)`) — the sidebar's Kind row. */
export const DOCKED_KIND_PARAM = 'dkind';
export const DOCKED_KIND_VALUES = ['purchase', 'return', 'trade_in', 'repair'] as const;
export type DockedKind = (typeof DOCKED_KIND_VALUES)[number];

/**
 * Docked activity-date window (civil day keys, inclusive) — the sidebar's
 * date row. Set, it replaces the `?weekOffset=` week slice over the loaded
 * history; unset, the history is all time (or the picked week).
 */
export const DOCKED_DATE_FROM_PARAM = 'dateFrom';
export const DOCKED_DATE_TO_PARAM = 'dateTo';

/** Params that belong only to the Docked (history) lane. */
const DOCKED_ONLY_PARAMS = [
  RECEIVING_HISTORY_URL_PARAMS.field,
  RECEIVING_HISTORY_URL_PARAMS.scope,
  DOCKED_FLAG_PARAM,
  DOCKED_KIND_PARAM,
  DOCKED_DATE_FROM_PARAM,
  DOCKED_DATE_TO_PARAM,
] as const;

export function parseInboundLane(raw: string | null | undefined): InboundLane {
  const value = String(raw || '').trim().toLowerCase();
  return (INBOUND_LANE_WIRE as readonly string[]).includes(value) ? (value as InboundLane) : 'pipeline';
}

/** True when `?sort=` is a Pipeline (Incoming) ORDER BY id. */
export function isPipelineSort(raw: string | null | undefined): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return (PIPELINE_SORT_IDS as readonly string[]).includes(v);
}

/** True when `?sort=` is a History / Docked ORDER BY id. */
export function isDockedSort(raw: string | null | undefined): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return (HISTORY_SORT_IDS as readonly string[]).includes(v);
}

/**
 * Accept any Incoming-desk sort (Pipeline ∪ Docked) for SurfaceParamHygiene.
 * Returns the raw id when valid, else null (stripped).
 */
export function parseInboundDeskSort(raw: string | null | undefined): string | null {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (isPipelineSort(v) || isDockedSort(v)) return v;
  return null;
}

/**
 * Clear params that belong to the other lane. Callers write `lane` (or delete
 * it for Pipeline) themselves, then pass the next params through this helper.
 */
export function clearCrossLaneParams(
  params: URLSearchParams,
  nextLane: InboundLane,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (nextLane === 'docked') {
    for (const key of [...PIPELINE_ONLY_PARAMS, ...PASTE_PARAMS]) next.delete(key);
    const sort = next.get('sort');
    if (sort && isPipelineSort(sort)) next.delete('sort');
    next.delete('page');
  } else if (nextLane === 'exceptions') {
    // Its own population: no facet, no paste, no Docked sort; Pipeline sorts apply.
    for (const key of [...PIPELINE_ONLY_PARAMS, ...PASTE_PARAMS, ...DOCKED_ONLY_PARAMS]) next.delete(key);
    const sort = next.get('sort');
    if (sort && isDockedSort(sort)) next.delete('sort');
    next.delete('page');
  } else {
    for (const key of [...DOCKED_ONLY_PARAMS, ...PASTE_PARAMS]) next.delete(key);
    const sort = next.get('sort');
    if (sort && isDockedSort(sort)) next.delete('sort');
    next.delete('page');
  }
  // The open record belongs to the lane it was picked on.
  next.delete('openLine');
  return next;
}

/**
 * Apply a lane switch onto a copy of the current search params.
 * Pipeline clears `lane`; Docked / Exceptions set it.
 */
export function applyInboundLane(
  searchParams: URLSearchParams,
  lane: InboundLane,
): URLSearchParams {
  const next = clearCrossLaneParams(searchParams, lane);
  if (lane === 'pipeline') next.delete(INBOUND_LANE_PARAM);
  else next.set(INBOUND_LANE_PARAM, lane);
  return next;
}
