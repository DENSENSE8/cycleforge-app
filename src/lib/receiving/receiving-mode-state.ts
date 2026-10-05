/**
 * The receiving-lines table's URL state → the single `ReceivingModeContext`
 * bag the active mode descriptor consumes. Pure: the table's hook
 * (`useReceivingModeContext`) reads it for the page it is on, and the
 * sidebar facets (`src/lib/nav/facets/unbox.ts`) read it for the page a facet
 * request names, so the list and its counts load the same rows.
 */

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
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import { resolveLiveReceivingMode } from '@/lib/surface-isolation';
import { parseStaffParam, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { INCOMING_SURFACE_ROUTE, UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { DOCKED_DATE_FROM_PARAM, DOCKED_DATE_TO_PARAM, INBOUND_FIND_PARAM, parseInboundLane } from '@/lib/receiving/inbound-lane';
import { parseDateKey } from '@/utils/date';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';
import { parseTrackingInParam, TRACKING_IN_PARAM } from '@/lib/receiving/tracking-paste';
import { parseRefInParam, REF_IN_PARAM } from '@/lib/receiving/reconcile';

type ParamReader = Pick<URLSearchParams, 'get'>;

export interface ReceivingModeState {
  mode: ReceivingModeDescriptor;
  isIncomingMode: boolean;
  isDockedMode: boolean;
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

function resolveTableMode(pathname: string, searchParams: ParamReader): ReceivingTableMode {
  // Unbox workbench tabs own the table mode (Queue / Viewed / History).
  if (pathname.startsWith(UNBOX_SURFACE_ROUTE)) {
    return resolveUnboxReceivingTableMode(getUnboxWorkspaceTabFromSearch(searchParams));
  }
  if (pathname.startsWith(INCOMING_SURFACE_ROUTE)) {
    const lane = parseInboundLane(searchParams.get('lane'));
    if (lane === 'docked') return 'docked';
    if (lane === 'unboxed') return 'history';
  }
  const base = getReceivingModeDescriptor(resolveLiveReceivingMode(pathname, searchParams)).id;
  // Retired Incoming `?incview=` tokens (`email`, `removed`) are not table
  // modes — hygiene coerces them off the desk.
  return base;
}

const INCOMING_DELIVERY_STATES: Readonly<Record<IncomingDeliveryState, true>> = {
  DELIVERED_UNOPENED: true,
  DELIVERED_NOT_UNBOXED: true,
  ARRIVING_TODAY: true,
  STALLED: true,
  IN_TRANSIT: true,
  TRACKING_UNAVAILABLE: true,
  PENDING_CARRIER: true,
  CARRIER_MISMATCH: true,
  AWAITING_TRACKING: true,
  WRONG_DESTINATION: true,
};

export function readReceivingModeState(pathname: string, searchParams: ParamReader): ReceivingModeState {
  const tableMode = resolveTableMode(pathname, searchParams);
  const mode = getReceivingTableModeDescriptor(tableMode);
  // Incoming chrome (header / inspector) is shared for the POS table mode.
  // `incoming_removed` stays in RECEIVING_MODES for legacy API tests but is no
  // longer reachable from the URL.
  const isIncomingMode = mode.id === 'incoming' || mode.id === 'incoming_removed';
  const isDockedMode = mode.id === 'docked';
  const isHistoryMode = mode.id === 'history';
  const isIncomingUnboxedLane =
    isHistoryMode
    && pathname.startsWith(INCOMING_SURFACE_ROUTE)
    && parseInboundLane(searchParams.get('lane')) === 'unboxed';

  // Deliveries › Docked binds the global header Find directly to the Arrival
  // feed query, so tracking suffixes are not limited to the currently painted
  // client window. Unbox History keeps its dedicated history-search parameter.
  const historySearch = isDockedMode
    ? (searchParams.get(INBOUND_FIND_PARAM)?.trim() ?? '')
    : (searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q)?.trim() ?? '');
  const historySearchField = isDockedMode
    ? 'tracking'
    : normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field));
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
  const incomingState = Object.hasOwn(INCOMING_DELIVERY_STATES, incomingStateRaw) ? (incomingStateRaw as IncomingDeliveryState) : null;
  // Sort axis + PO date range — driven by IncomingWorkspaceHeader (sort +
  // Filters date range). All flow straight into the API query string; no
  // client-side filtering of the date range (server already narrows).
  const incomingSort = isIncomingMode ? (searchParams.get('sort') || '').trim() : '';
  // History reuses the shared `?sort=` param (modes are exclusive).
  // (operator 2026-09-14 — the entire product/PO history is the default view;
  const historyWeekExplicit = isHistoryMode && searchParams.get(WEEK_OFFSET_PARAM) != null;
  // Inbound History's sidebar date row: an explicit activity window (either
  // end open). Only valid civil day keys count; the Unbox History tab's route
  // never keeps these params, so there it is always the week pill.
  const isCartonActivityMode = isHistoryMode || isDockedMode;
  const historyDateFrom = isCartonActivityMode && parseDateKey(searchParams.get(DOCKED_DATE_FROM_PARAM))
    ? searchParams.get(DOCKED_DATE_FROM_PARAM)!.trim()
    : '';
  const historyDateTo = isCartonActivityMode && parseDateKey(searchParams.get(DOCKED_DATE_TO_PARAM))
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

  // Pasted list — the operator's strings. Incoming swaps its lane for
  // `view=reconcile`; Unboxed (`/incoming?lane=unboxed`) narrows its own lane.
  // No other history host (Unbox tab, standalone History) reads it.
  const refIn = isIncomingMode || isIncomingUnboxedLane ? parseRefInParam(searchParams.get(REF_IN_PARAM)).refs : [];
  // `/incoming?lane=exceptions` — its own server view on the Incoming ledger.
  const incomingExceptions =
    isIncomingMode && pathname.startsWith(INCOMING_SURFACE_ROUTE) && parseInboundLane(searchParams.get('lane')) === 'exceptions';

  const ustageRaw = (searchParams.get('ustage') || '').trim().toLowerCase();
  const ulaneRaw = (searchParams.get('ulane') || '').trim().toUpperCase();
  const priorityOnlyRaw = (searchParams.get('priority_only') || '').trim().toLowerCase();

  const modeContext: ReceivingModeContext = {
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
    staffFilterId: parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId')),
    listSearch: searchParams.get('search')?.trim() ?? '',
    queueStage: ustageRaw === 'staged' || ustageRaw === 'unstaged' ? ustageRaw : null,
    queueLane:
      ulaneRaw === 'PO_STOCKOUT' || ulaneRaw === 'PO_STANDARD' || ulaneRaw === 'RETURN' || ulaneRaw === 'HOLD'
        ? ulaneRaw
        : null,
    priorityOnly: priorityOnlyRaw === '1' || priorityOnlyRaw === 'true',
    // Bulk tracking paste — the mode descriptors, the query key and the
    // grid's column tiers all read this one list.
    trackingIn: parseTrackingInParam(searchParams.get(TRACKING_IN_PARAM)).keys,
    refIn,
    incomingExceptions,
  };

  return {
    mode,
    isIncomingMode,
    isDockedMode,
    isHistoryMode,
    historyAxis,
    incomingPage,
    isDeliveredUnscannedFacet,
    isDeliveredNotUnboxedFacet,
    skipWeekFilter: mode.skipWeekFilter(modeContext),
    modeContext,
  };
}
