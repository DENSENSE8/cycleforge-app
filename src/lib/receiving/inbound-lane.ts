/** Inbound desk lane — Pipeline (on the way) vs Docked (landed activity). */

import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { HISTORY_SORT_WIRE_IDS } from '@/lib/receiving/receiving-modes';

export type InboundLane = 'pipeline' | 'docked';

const INBOUND_LANE_PARAM = 'lane';

/** Wire value that selects Docked; Pipeline omits the param. */
const INBOUND_LANE_DOCKED = 'docked' as const;

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

/** Params that belong only to the Docked (history) lane. */
const DOCKED_ONLY_PARAMS = [
  RECEIVING_HISTORY_URL_PARAMS.field,
  RECEIVING_HISTORY_URL_PARAMS.scope,
] as const;

export function parseInboundLane(raw: string | null | undefined): InboundLane {
  return String(raw || '').trim().toLowerCase() === INBOUND_LANE_DOCKED ? 'docked' : 'pipeline';
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
    for (const key of PIPELINE_ONLY_PARAMS) next.delete(key);
    const sort = next.get('sort');
    if (sort && isPipelineSort(sort)) next.delete('sort');
    next.delete('page');
  } else {
    for (const key of DOCKED_ONLY_PARAMS) next.delete(key);
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
 * Pipeline clears `lane`; Docked sets `lane=docked`.
 */
export function applyInboundLane(
  searchParams: URLSearchParams,
  lane: InboundLane,
): URLSearchParams {
  const next = clearCrossLaneParams(searchParams, lane);
  if (lane === 'docked') next.set(INBOUND_LANE_PARAM, INBOUND_LANE_DOCKED);
  else next.delete(INBOUND_LANE_PARAM);
  return next;
}
