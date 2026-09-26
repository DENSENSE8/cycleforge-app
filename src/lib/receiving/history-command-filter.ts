/** Unbox History Band 3 command-row filter bag — URL SoT for find + exact-match refine (`?rh_q=` / `?rh_field=` / `?rh_scope=` / `?sort=` /… */

import { parseStaffParam, STAFF_FILTER_PARAM } from '@/hooks/useStaffFilter';
import {
  HISTORY_DEFAULT_SORT,
  normalizeHistorySort,
  type HistorySortWireId,
} from '@/lib/receiving/receiving-modes';
import {
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  RECEIVING_HISTORY_URL_PARAMS,
  setReceivingHistoryUrlParams,
  type ReceivingHistorySearchField,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import {
  parseWeekOffset,
  WEEK_OFFSET_PARAM,
} from '@/lib/station/table-url-params';

/** Server-order axis for History (`?sort=`). Display column sort stays on `colsort`. */
export type HistorySortId = HistorySortWireId;

export type HistoryCommandFilterState = {
  q: string;
  field: ReceivingHistorySearchField;
  scope: ReceivingHistorySearchScope;
  sort: HistorySortId;
  staffId: number | null;
  /** 0 = this week (param omitted). */
  weekOffset: number;
};

/** Default bag when the History URL has no find/refine params. */
export const EMPTY_HISTORY_COMMAND_FILTER: HistoryCommandFilterState = {
  q: '',
  field: 'all',
  scope: 'all',
  sort: HISTORY_DEFAULT_SORT as HistorySortId,
  staffId: null,
  weekOffset: 0,
};

/** Source scope rows exposed in the Unbox History Refine funnel. */
export const HISTORY_REFINE_SOURCE_OPTIONS = [
  { id: 'all' as const, label: 'All' },
  { id: 'unmatched' as const, label: 'Unfound' },
];

/** Week facet rows in the Refine funnel (`?weekOffset=`). */
export const HISTORY_REFINE_WEEK_OPTIONS = [
  { offset: 0, label: 'This week' },
  { offset: 1, label: 'Last week' },
  { offset: 2, label: '2 weeks ago' },
  { offset: 3, label: '3 weeks ago' },
] as const;

/**
 * Top tabs inside the History Refine funnel — one facet body at a time
 * (industry filter-dialog pattern; not page lifecycle tabs).
 */
export type HistoryRefineFacetId = 'staff' | 'source' | 'field' | 'week';

export const HISTORY_REFINE_FACETS = [
  { id: 'staff' as const, label: 'Staff' },
  { id: 'source' as const, label: 'Source' },
  { id: 'field' as const, label: 'Field' },
  { id: 'week' as const, label: 'Week' },
] as const satisfies ReadonlyArray<{ id: HistoryRefineFacetId; label: string }>;

/** True when a single Refine facet is non-default (segment hot hint). */
export function isHistoryRefineFacetHot(
  facet: HistoryRefineFacetId,
  state: HistoryCommandFilterState,
): boolean {
  switch (facet) {
    case 'staff':
      return state.staffId != null;
    case 'source':
      return state.scope !== 'all';
    case 'field':
      return state.field !== 'all';
    case 'week':
      return state.weekOffset > 0;
  }
}

/** True when any non-default query facet is active (funnel hot dot). */
export function isHistoryCommandFilterHot(state: HistoryCommandFilterState): boolean {
  return (
    state.field !== 'all'
    || state.scope !== 'all'
    || state.sort !== HISTORY_DEFAULT_SORT
    || state.staffId != null
    || state.weekOffset > 0
  );
}

/** Read the History command-row filter bag from the current URL. */
export function readHistoryCommandFilterState(
  searchParams: URLSearchParams,
): HistoryCommandFilterState {
  return {
    q: (searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '').trim(),
    field: normalizeReceivingHistorySearchField(
      searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field),
    ),
    scope: normalizeReceivingHistorySearchScope(
      searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope),
    ),
    sort: normalizeHistorySort(searchParams.get('sort')) as HistorySortId,
    staffId: parseStaffParam(
      searchParams.get(STAFF_FILTER_PARAM) ?? searchParams.get('staffId'),
    ),
    weekOffset: Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM))),
  };
}

/**
 * Patch History command-row filters onto a URLSearchParams clone.
 * Omits defaults (`sort=unboxed_newest`, `field=all`, empty `q`, null staff,
 * `weekOffset=0`).
 */
export function applyHistoryCommandFilterState(
  searchParams: URLSearchParams,
  patch: Partial<HistoryCommandFilterState>,
): URLSearchParams {
  let next = new URLSearchParams(searchParams.toString());
  if (patch.q !== undefined || patch.field !== undefined || patch.scope !== undefined) {
    next = setReceivingHistoryUrlParams(next, {
      q: patch.q,
      field: patch.field,
      scope: patch.scope,
    });
  }
  if (patch.sort !== undefined) {
    const normalized = normalizeHistorySort(patch.sort);
    if (normalized === HISTORY_DEFAULT_SORT) next.delete('sort');
    else next.set('sort', normalized);
  }
  if (patch.staffId !== undefined) {
    if (patch.staffId == null || patch.staffId <= 0) {
      next.delete(STAFF_FILTER_PARAM);
      next.delete('staffId');
    } else {
      next.set(STAFF_FILTER_PARAM, String(patch.staffId));
      next.delete('staffId');
    }
  }
  if (patch.weekOffset !== undefined) {
    const offset = Math.max(0, Math.trunc(patch.weekOffset) || 0);
    if (offset <= 0) next.delete(WEEK_OFFSET_PARAM);
    else next.set(WEEK_OFFSET_PARAM, String(offset));
  }
  return next;
}
