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

/** A pasted list reconciles On the way; Exceptions and Docked never carry it. */
const PASTE_PARAMS = ['ref_in', 'recon'] as const;

/** Params that belong only to the Docked (history) lane. */
const DOCKED_ONLY_PARAMS = [
  RECEIVING_HISTORY_URL_PARAMS.field,
  RECEIVING_HISTORY_URL_PARAMS.scope,
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
