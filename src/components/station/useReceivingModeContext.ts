'use client';

/** Parses the receiving-lines table's URL state into the single `ReceivingModeContext` bag the active mode descriptor consumes for every… */

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { IncomingDeliveryState } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
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
import { parseStaffParam, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { INCOMING_SURFACE_ROUTE, UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { DOCKED_DATE_FROM_PARAM, DOCKED_DATE_TO_PARAM, parseInboundLane } from '@/lib/receiving/inbound-lane';
import { parseDateKey } from '@/utils/date';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';
import { parseTrackingInParam, TRACKING_IN_PARAM } from '@/lib/receiving/tracking-paste';
import { parseRefInParam, REF_IN_PARAM } from '@/lib/receiving/reconcile';

interface ReceivingModeState {
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
  const base = getReceivingModeDescriptor(resolveLiveReceivingMode(pathname, searchParams)).id;
  // Retired Incoming `?incview=` tokens (`email`, `removed`) are not table
  // modes — hygiene coerces them off the desk.
  return base;
}

export function useReceivingModeContext(): ReceivingModeState {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const tableMode = resolveTableMode(pathname, searchParams);
  const mode = getReceivingTableModeDescriptor(tableMode);
  // Incoming chrome (header / inspector) is shared for the POS table mode.
  // `incoming_removed` stays in RECEIVING_MODES for legacy API tests but is no
  // longer reachable from the URL.
  const isIncomingMode = mode.id === 'incoming' || mode.id === 'incoming_removed';
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
  // Sort axis + PO date range — driven by IncomingWorkspaceHeader (sort +
  // Filters date range). All flow straight into the API query string; no
  // client-side filtering of the date range (server already narrows).
  const incomingSort = isIncomingMode ? (searchParams.get('sort') || '').trim() : '';
  // History reuses the shared `?sort=` param (modes are exclusive).
  // (operator 2026-09-14 — the entire product/PO history is the default view;
  const historyWeekExplicit = isHistoryMode && searchParams.has(WEEK_OFFSET_PARAM);
  // Inbound History's sidebar date row: an explicit activity window (either
  // end open). Only valid civil day keys count; the Unbox History tab's route
  // never keeps these params, so there it is always the week pill.
  const historyDateFrom = isHistoryMode && parseDateKey(searchParams.get(DOCKED_DATE_FROM_PARAM))
    ? searchParams.get(DOCKED_DATE_FROM_PARAM)!.trim()
    : '';
  const historyDateTo = isHistoryMode && parseDateKey(searchParams.get(DOCKED_DATE_TO_PARAM))
    ? searchParams.get(DOCKED_DATE_TO_PARAM)!.trim()
    : '';
  const historySort = isHistoryMode ? (searchParams.get('sort') || '').trim() : '';
  const historyAxis: ReceivingActivityAxis = isHistoryMode
    ? historySortGroupAxis(historySort)
    : 'scanned';
  const incomingPoFrom = isIncomingMode ? (searchParams.get('po_from') || '').trim() : '';
  const incomingPoTo = isIncomingMode ? (searchParams.get('po_to') || '').trim() : '';
  // Purchasing-source filter (`?inbound=`): which account the incoming order came
  // from (All / Zoho / eBay via Band-3 search-field filter). Defaults to `all`;
  // only the two narrowing values are honored, so junk falls back to the union.
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

  // "Delivered · not scanned" is an Incoming sub-facet fed by a separate shipment-level query; it owns its own empty copy, so the descriptor…
  const isDefaultIncomingLane = mode.id === 'incoming';
  const isDeliveredUnscannedFacet =
    isDefaultIncomingLane && incomingState === 'DELIVERED_UNOPENED';
  const isDeliveredNotUnboxedFacet =
    isDefaultIncomingLane && incomingState === 'DELIVERED_NOT_UNBOXED';

  // Bulk tracking paste. Parsed once here so the mode descriptors, the query
  // key and the grid's column tiers all read the same list.
  const trackingIn = parseTrackingInParam(searchParams.get(TRACKING_IN_PARAM)).keys;
  const trackingInKey = trackingIn.join(',');
  // Inbound reconciliation paste — the operator's strings. Only the Incoming
  // lane reads it (it swaps the lane for `view=reconcile`).
  const refIn = isIncomingMode ? parseRefInParam(searchParams.get(REF_IN_PARAM)).refs : [];
  // `/incoming?lane=exceptions` — its own server view on the Incoming ledger.
  const incomingExceptions =
    isIncomingMode && pathname.startsWith(INCOMING_SURFACE_ROUTE) && parseInboundLane(searchParams.get('lane')) === 'exceptions';
  const refInKey = refIn.join(',');

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
  const priorityOnlyRaw = (searchParams.get('priority_only') || '').trim().toLowerCase();
  const priorityOnly = priorityOnlyRaw === '1' || priorityOnlyRaw === 'true';

  // Single bag of parsed URL state handed to the active descriptor. Memoized so
  // the query key / params stay referentially stable across unrelated re-renders.
  const modeContext = useMemo<ReceivingModeContext>(
    () => ({
      historySearch,
      historySearchField,
      historySearchScope,
      historySort,
      historyWeekExplicit,
      historyDateRange: historyDateFrom || historyDateTo ? { from: historyDateFrom, to: historyDateTo } : null,
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
      priorityOnly,
      trackingIn,
      refIn,
      incomingExceptions,
    }),
    [
      historySearch,
      historySearchField,
      historySearchScope,
      historySort,
      historyWeekExplicit,
      historyDateFrom,
      historyDateTo,
      incomingSearch,
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
      priorityOnly,
      // Depend on the JOINED key, not the array: `parseTrackingInParam` returns
      // a fresh array every render, so the array itself would defeat the memo
      // and re-key the react-query fetch on every keystroke elsewhere.
      trackingInKey,
      refInKey,
      incomingExceptions,
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
