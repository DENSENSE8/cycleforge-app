'use client';

/**
 * Parses the receiving-lines table's URL state into the single `ReceivingModeContext`
 * bag the active mode descriptor consumes for every data-layer decision (which
 * API view to request, paging/keying/grouping/sorting, empty copy), plus the
 * presentational flags the component forks on. Extracted from ReceivingLinesTable;
 * behaviour is unchanged.
 */

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { IncomingDeliveryState } from '@/components/sidebar/receiving/IncomingSidebarPanel';
import {
  getReceivingModeDescriptor,
  getReceivingTableModeDescriptor,
  historySortGroupAxis,
  resolveUnboxReceivingTableMode,
  type ReceivingModeContext,
  type ReceivingModeDescriptor,
  type ReceivingTableMode,
} from '@/lib/receiving/receiving-modes';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import { resolveLiveReceivingMode } from '@/lib/surface-isolation';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';
import { parseStaffParam } from '@/hooks/useStaffFilter';

export interface ReceivingModeState {
  mode: ReceivingModeDescriptor;
  isIncomingMode: boolean;
  isHistoryMode: boolean;
  /** Lifecycle timestamp History day-bands + within-day order on (from `?sort=`). */
  historyAxis: ReceivingActivityAxis;
  /** 1-based Incoming page from `?page=` (>=1). */
  incomingPage: number;
  /** Incoming `DELIVERED_UNOPENED` sub-facet (shipment-level feed). */
  isDeliveredUnscannedFacet: boolean;
  /** Incoming `DELIVERED_NOT_UNBOXED` sub-facet (line-level dedicated feed). */
  isDeliveredNotUnboxedFacet: boolean;
  /** The descriptor opted this context out of the week filter. */
  skipWeekFilter: boolean;
  modeContext: ReceivingModeContext;
}

function resolveTableMode(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'get'>,
): ReceivingTableMode {
  // Unbox workbench tabs own the table mode (Queue / Viewed / History).
  if (pathname.startsWith(UNBOX_SURFACE_ROUTE)) {
    return resolveUnboxReceivingTableMode(getUnboxWorkspaceTabFromSearch(searchParams));
  }
  return getReceivingModeDescriptor(resolveLiveReceivingMode(pathname, searchParams)).id;
}

export function useReceivingModeContext(): ReceivingModeState {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const tableMode = resolveTableMode(pathname, searchParams);
  const mode = getReceivingTableModeDescriptor(tableMode);
  const isIncomingMode = mode.id === 'incoming';
  const isHistoryMode = mode.id === 'history';

  const historySearch = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q)?.trim() ?? '';
  const historySearchField = normalizeReceivingHistorySearchField(
    searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field),
  );
  const historySearchScope = normalizeReceivingHistorySearchScope(
    searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope),
  );

  // Incoming-only URL params: shares `?q=` with history's search box (free
  // text), adds `?state=` for the delivery_state facet. Keeping `q` on the same
  // key means the search bar value survives a mode flip from Incoming → History.
  const incomingSearch = isIncomingMode
    ? (searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q)?.trim() ?? '')
    : '';
  const incomingStateRaw = (searchParams.get('state') || '').trim().toUpperCase();
  const incomingState: IncomingDeliveryState | null =
    incomingStateRaw === 'DELIVERED_UNOPENED'
      || incomingStateRaw === 'DELIVERED_NOT_UNBOXED'
      || incomingStateRaw === 'ARRIVING_TODAY'
      || incomingStateRaw === 'STALLED'
      || incomingStateRaw === 'IN_TRANSIT'
      || incomingStateRaw === 'TRACKING_UNAVAILABLE'
      || incomingStateRaw === 'PENDING_CARRIER'
      || incomingStateRaw === 'CARRIER_MISMATCH'
      || incomingStateRaw === 'AWAITING_TRACKING'
      || incomingStateRaw === 'WRONG_DESTINATION'
      ? (incomingStateRaw as IncomingDeliveryState)
      : null;
  // Sort axis + PO date range — driven by IncomingPaneHeader (sort) and
  // IncomingSidebarPanel (date range). All flow straight into the API query
  // string; no client-side filtering of the date range (server already narrows).
  const incomingSort = isIncomingMode ? (searchParams.get('sort') || '').trim() : '';
  // History reuses the shared `?sort=` param (modes are exclusive). The resolved
  // axis drives client day-banding + within-day order; the same sort is sent to
  // the API for the server ORDER BY window.
  const historySort = isHistoryMode ? (searchParams.get('sort') || '').trim() : '';
  const historyAxis: ReceivingActivityAxis = isHistoryMode
    ? historySortGroupAxis(historySort)
    : 'scanned';
  const incomingPoFrom = isIncomingMode ? (searchParams.get('po_from') || '').trim() : '';
  const incomingPoTo = isIncomingMode ? (searchParams.get('po_to') || '').trim() : '';
  // Purchasing-source tab (`?inbound=`): which account the incoming order came
  // from (All / Zoho / eBay). Defaults to `all`; only the two narrowing values
  // are honored, so junk falls back to the unioned view.
  const incomingSourceRaw = isIncomingMode
    ? (searchParams.get('inbound') || '').trim().toLowerCase()
    : '';
  const incomingSource: 'all' | 'zoho' | 'ebay' =
    incomingSourceRaw === 'ebay' ? 'ebay' : incomingSourceRaw === 'zoho' ? 'zoho' : 'all';
  // Pagination — server-side LIMIT 50 + page offset. Page numbers are 1-based in
  // the URL ("?page=2" = second page). Malformed/missing falls back to 1.
  const incomingPageRaw = isIncomingMode ? Number(searchParams.get('page') || '1') : 1;
  const incomingPage =
    Number.isFinite(incomingPageRaw) && incomingPageRaw >= 1 ? Math.floor(incomingPageRaw) : 1;

  // "Delivered · not scanned" is an Incoming sub-facet fed by a separate
  // shipment-level query; it owns its own empty copy, so the descriptor needs to
  // know about it. Derived early so it can flow into the mode context.
  const isDeliveredUnscannedFacet =
    isIncomingMode && incomingState === 'DELIVERED_UNOPENED';
  const isDeliveredNotUnboxedFacet =
    isIncomingMode && incomingState === 'DELIVERED_NOT_UNBOXED';

  const staffFilterId = parseStaffParam(
    searchParams.get('staff') ?? searchParams.get('staffId'),
  );
  const listSearch = searchParams.get('search')?.trim() ?? '';
  const ustageRaw = (searchParams.get('ustage') || '').trim().toLowerCase();
  const queueStage: 'staged' | 'unstaged' | null =
    ustageRaw === 'staged' || ustageRaw === 'unstaged' ? ustageRaw : null;
  const ulaneRaw = (searchParams.get('ulane') || '').trim().toUpperCase();
  const queueLane: 'PO_STOCKOUT' | 'PO_STANDARD' | 'RETURN' | 'HOLD' | null =
    ulaneRaw === 'PO_STOCKOUT'
    || ulaneRaw === 'PO_STANDARD'
    || ulaneRaw === 'RETURN'
    || ulaneRaw === 'HOLD'
      ? ulaneRaw
      : null;

  // Single bag of parsed URL state handed to the active descriptor. Memoized so
  // the query key / params stay referentially stable across unrelated re-renders.
  const modeContext = useMemo<ReceivingModeContext>(
    () => ({
      historySearch,
      historySearchField,
      historySearchScope,
      historySort,
      incomingSearch,
      incomingState,
      incomingSort,
      incomingPoFrom,
      incomingPoTo,
      incomingPage,
      incomingSource,
      isDeliveredUnscannedFacet,
      isDeliveredNotUnboxedFacet,
      staffFilterId,
      listSearch,
      queueStage,
      queueLane,
    }),
    [
      historySearch,
      historySearchField,
      historySearchScope,
      historySort,
      incomingSearch,
      incomingState,
      incomingSort,
      incomingPoFrom,
      incomingPoTo,
      incomingPage,
      incomingSource,
      isDeliveredUnscannedFacet,
      isDeliveredNotUnboxedFacet,
      staffFilterId,
      listSearch,
      queueStage,
      queueLane,
    ],
  );

  const skipWeekFilter = mode.skipWeekFilter(modeContext);

  return {
    mode,
    isIncomingMode,
    isHistoryMode,
    historyAxis,
    incomingPage,
    isDeliveredUnscannedFacet,
    isDeliveredNotUnboxedFacet,
    skipWeekFilter,
    modeContext,
  };
}
