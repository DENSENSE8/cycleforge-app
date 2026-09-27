/** Prop-driven receiving mode state for Unbox compare panes. */

import {
  getReceivingTableModeDescriptor,
  historySortGroupAxis,
  resolveUnboxReceivingTableMode,
  type ReceivingModeContext,
  type ReceivingModeDescriptor,
  type ReceivingTableMode,
} from '@/lib/receiving/receiving-modes';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import {
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';

/** Facets a compare pane may override independently of the page URL. */
type ReceivingPaneQuery = {
  /** Unbox tab vocabulary — maps to table mode via resolveUnboxReceivingTableMode. */
  tab: UnboxWorkspaceTab;
  /** Free-text list search (`?search=` on single layout). */
  listSearch?: string;
  /** Queue stage facet. */
  queueStage?: 'staged' | 'unstaged' | null;
  /** Queue priority lane. */
  queueLane?: 'PO_STOCKOUT' | 'PO_STANDARD' | 'RETURN' | 'HOLD' | null;
  /** History / list staff filter. */
  staffFilterId?: number | null;
  /** History sort id (`unboxed_newest` / `scanned_newest`). */
  historySort?: string;
  /** History search box. */
  historySearch?: string;
};

type ReceivingPaneModeState = {
  mode: ReceivingModeDescriptor;
  tableMode: ReceivingTableMode;
  isHistoryMode: boolean;
  historyAxis: ReceivingActivityAxis;
  skipWeekFilter: boolean;
  modeContext: ReceivingModeContext;
};

const EMPTY_TRACKING: string[] = [];

/**
 * Build the mode bag a pane passes to {@link useReceivingLinesData} without
 * reading the page URL.
 */
export function buildReceivingPaneModeState(
  query: ReceivingPaneQuery,
): ReceivingPaneModeState {
  const tableMode = resolveUnboxReceivingTableMode(query.tab);
  const mode = getReceivingTableModeDescriptor(tableMode);
  const isHistoryMode = mode.id === 'history';
  const historySort = isHistoryMode ? (query.historySort ?? '').trim() : '';
  const historyAxis: ReceivingActivityAxis = isHistoryMode
    ? historySortGroupAxis(historySort)
    : 'scanned';

  const modeContext: ReceivingModeContext = {
    historySearch: query.historySearch?.trim() ?? '',
    historySearchField: normalizeReceivingHistorySearchField(null),
    historySearchScope: normalizeReceivingHistorySearchScope(null),
    historySort,
    incomingSearch: '',
    incomingState: null,
    incomingSort: '',
    incomingPoFrom: '',
    incomingPoTo: '',
    incomingPage: 1,
    incomingSource: 'all',
    isDeliveredUnscannedFacet: false,
    isDeliveredNotUnboxedFacet: false,
    staffFilterId: query.staffFilterId ?? null,
    listSearch: query.listSearch?.trim() ?? '',
    queueStage: query.queueStage ?? null,
    queueLane: query.queueLane ?? null,
    priorityOnly: false,
    trackingIn: EMPTY_TRACKING,
    refIn: EMPTY_TRACKING,
    incomingExceptions: false,
  };

  return {
    mode,
    tableMode,
    isHistoryMode,
    historyAxis,
    skipWeekFilter: mode.skipWeekFilter(modeContext),
    modeContext,
  };
}

/** Stable react-query / memo key for a pane recipe. */
export function receivingPaneQueryKey(query: ReceivingPaneQuery): string {
  return [
    query.tab,
    query.listSearch ?? '',
    query.queueStage ?? '',
    query.queueLane ?? '',
    query.staffFilterId ?? '',
    query.historySort ?? '',
    query.historySearch ?? '',
  ].join('\0');
}
