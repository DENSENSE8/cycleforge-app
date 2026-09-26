/** Receiving lines-table mode registry. */

import {
  RECEIVING_HISTORY_URL_PARAMS,
  type ReceivingHistorySearchField,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import type { ReceivingView } from '@/lib/receiving/receiving-views';
import { serializeTrackingIn, TRACKING_IN_PARAM } from '@/lib/receiving/tracking-paste';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';

/** Server-side page size for the Incoming list (other modes use a long scroll). */
export const INCOMING_PAGE_SIZE = 50;

/** Long-scroll row cap shared by the non-paginated modes (Receive / History). */
export const RECEIVING_TABLE_LIMIT = 500;

/**
 * History ceiling (operator 2026-09-14:
 * History ceiling (operator 2026-09-14: "the inbound history displays the
 */
export const RECEIVING_HISTORY_LIMIT = 3000;

/** The display modes the lines table itself knows how to render. */
export type ReceivingTableMode =
  | 'receive'
  | 'history'
  | 'incoming'
  | 'incoming_removed'
  | 'unbox_queue'
  | 'unbox_viewed';

/** Resolve the raw `?mode=` URL value to the table mode. */
export function resolveReceivingTableMode(raw: string | null | undefined): ReceivingTableMode {
  return raw === 'incoming' ? 'incoming' : raw === 'history' ? 'history' : 'receive';
}

/** Unbox workbench tab → lines-table mode. */
export function resolveUnboxReceivingTableMode(
  tab: UnboxWorkspaceTab,
): ReceivingTableMode {
  if (tab === 'incoming') return 'incoming';
  if (tab === 'queue' || tab === 'all') return 'unbox_queue';
  if (tab === 'recent') return 'unbox_viewed';
  return 'history';
}

/** Axis each mode groups its date headers on. */
export type ReceivingGroupAxis = 'activity' | 'po_date';

/** One entry in a mode's sort-by control. `id` is the `?sort=` value. */
export interface ReceivingSortOption {
  id: string;
  label: string;
}

/**
 * History / Docked accepted `?sort=` wire ids. Includes `scanned_newest` for
 * Incoming Docked · Triage (door-scan order) — not shown in Unbox History's
 * Sort-by menu (triage / arrival language).
 */
export const HISTORY_SORT_WIRE_IDS = [
  'unboxed_newest',
  'scanned_newest',
] as const;

export type HistorySortWireId = (typeof HISTORY_SORT_WIRE_IDS)[number];

/**
 * Unbox History filter "Sort by" options — Unbox-touched axis only.
 * Door-scan / triage ordering stays on Incoming Docked · Triage
 * (`scanned_newest` in {@link HISTORY_SORT_WIRE_IDS}), not this menu.
 */
export const HISTORY_SORT_OPTIONS = [
  { id: 'unboxed_newest', label: 'Unboxed' },
] as const satisfies readonly ReceivingSortOption[];

/** Implicit default — omitted from the URL when active. */
export const HISTORY_DEFAULT_SORT: HistorySortWireId = 'unboxed_newest';

/** Coerce an arbitrary `?sort=` to a valid History/Docked sort (default on miss). */
export function normalizeHistorySort(raw: string | null | undefined): HistorySortWireId {
  const v = String(raw || '').trim().toLowerCase();
  return (HISTORY_SORT_WIRE_IDS as readonly string[]).includes(v)
    ? (v as HistorySortWireId)
    : HISTORY_DEFAULT_SORT;
}

/**
 * Maps a History `?sort=` value to the lifecycle axis used for day-banding and
 * within-day order. Must stay aligned with the server ORDER BY for each sort id.
 */
export function historySortGroupAxis(
  sort: string | null | undefined,
): 'scanned' | 'unboxed' {
  const s = normalizeHistorySort(sort);
  if (s === 'scanned_newest') return 'scanned';
  return 'unboxed';
}

/** Everything a descriptor needs from the URL, parsed by the component once and handed to whichever descriptor is active. */
export interface ReceivingModeContext {
  // History facets
  historySearch: string;
  historySearchField: ReceivingHistorySearchField;
  historySearchScope: ReceivingHistorySearchScope;
  /** History sort axis (`?sort=`); see HISTORY_SORT_WIRE_IDS / HISTORY_SORT_OPTIONS. */
  historySort: string;
  /** TRUE only when `?weekOffset` is EXPLICITLY in the URL (operator 2026-09-14: */
  historyWeekExplicit?: boolean;
  // Incoming facets
  incomingSearch: string;
  incomingState: string | null;
  incomingSort: string;
  incomingPoFrom: string;
  incomingPoTo: string;
  incomingPage: number;
  /** Purchasing-source filter (`?inbound=`): */
  incomingSource: 'all' | 'zoho' | 'ebay';
  /**
   * Incoming sub-facet: the shipment-anchored "delivered but not dock-scanned"
   * feed. It bypasses the normal list query, so it owns its own empty copy.
   */
  isDeliveredUnscannedFacet: boolean;
  /**
   * Incoming sub-facet: carrier-delivered cartons not yet unboxed (includes
   * dock-scanned). Uses a dedicated feed because view=incoming drops scanned rows.
   */
  isDeliveredNotUnboxedFacet: boolean;
  /**
   * Universal `?staff=` filter (P1-WORK-02). Null / absent = all staff.
   * Forwarded on Unbox queue/viewed/history and History table queries.
   */
  staffFilterId: number | null;
  /**
   * Free-text list filter from `?search=` (Unbox Queue / Viewed workbench
   * search). History uses `historySearch` (`rh_q`) instead.
   */
  listSearch: string;
  /**
   * Unbox Queue readiness (`?ustage=`): `staged` | `unstaged` | null (all).
   */
  queueStage: 'staged' | 'unstaged' | null;
  /**
   * Unbox Queue priority lane (`?ulane=`). Null = all lanes.
   */
  queueLane: 'PO_STOCKOUT' | 'PO_STANDARD' | 'RETURN' | 'HOLD' | null;
  /**
   * Unbox Urgent (`?priority_only=1`) — explicit priority flag / tier on the
   * scanned queue. Owned by `normalizeUnboxWorkspaceTabParams` when tab=urgent.
   */
  priorityOnly: boolean;
  /** `?tracking_in=` — canonical tracking keys from a bulk paste. */
  trackingIn: string[];
}

export interface ReceivingModeDescriptor {
  id: ReceivingTableMode;
  /** The `?view=` value this mode requests from `/api/receiving-lines`. */
  apiView: ReceivingView;
  /** Date-header grouping axis. */
  groupAxis: ReceivingGroupAxis;
  /**
   * When true the server's `ORDER BY` is authoritative and the client must NOT
   * re-sort within a date group (Incoming's Sort control drives the order).
   * When false the client re-sorts each group by activity recency.
   */
  serverSorted: boolean;
  /**
   * Incoming renders a purpose-built pane header (count + pagination) and drops
   * the carrier/serial chips + workflow label from rows (EXPECTED is implied).
   */
  isIncoming: boolean;
  /** Server page size, or `null` for the long-scroll modes. */
  pageSize: number | null;
  /**
   * Sort axes this mode exposes in its sort-by control. Absent = no sort UI for
   * the mode. The active descriptor's list drives the shared sort control, so
   * each mode stays self-contained (its own axes + default + group behavior).
   */
  sortOptions?: readonly ReceivingSortOption[];
  /** The implicit default sort id (dropped from the URL when selected). */
  defaultSort?: string;
  /** Build the `/api/receiving-lines` query string for this mode. */
  buildParams(ctx: ReceivingModeContext): URLSearchParams;
  /** React-query key — must vary with every server-affecting input. */
  queryKey(ctx: ReceivingModeContext): readonly unknown[];
  /**
   * Whether to bypass the client-side PST week slice. Searches/facets narrow
   * globally, so week scoping would hide otherwise-matching rows.
   */
  skipWeekFilter(ctx: ReceivingModeContext): boolean;
  /** Empty-state copy for the current context. */
  emptyMessage(ctx: ReceivingModeContext): string;
}

const QUERY_ROOT = 'receiving-lines-table';

function applyStaffParam(p: URLSearchParams, ctx: ReceivingModeContext): void {
  if (ctx.staffFilterId != null) p.set('staff', String(ctx.staffFilterId));
}

/** Bulk tracking paste — forwarded on every lane that can be interrogated by one. */
function applyTrackingInParam(p: URLSearchParams, ctx: ReceivingModeContext): void {
  if (ctx.trackingIn.length > 0) p.set(TRACKING_IN_PARAM, serializeTrackingIn(ctx.trackingIn));
}

const receiveMode: ReceivingModeDescriptor = {
  id: 'receive',
  // 'all' unions recent + received and keeps the untouched-incoming rows so the
  // Receive workspace's date grouping sees every row.
  apiView: 'all',
  groupAxis: 'activity',
  serverSorted: false,
  isIncoming: false,
  pageSize: null,
  buildParams(ctx) {
    const p = new URLSearchParams({
      limit: String(RECEIVING_TABLE_LIMIT),
      offset: '0',
    });
    p.set('include', 'serials');
    p.set('view', 'all');
    applyStaffParam(p, ctx);
    return p;
  },
  queryKey(ctx) {
    return [QUERY_ROOT, 'all', 'receive', ctx.staffFilterId ?? 'all'] as const;
  },
  skipWeekFilter() {
    return false;
  },
  emptyMessage() {
    return 'No lines yet — start scanning to populate.';
  },
};

/** Unbox · Queue — door-scanned matched POs waiting to unbox. */
const unboxQueueMode: ReceivingModeDescriptor = {
  id: 'unbox_queue',
  apiView: 'scanned',
  groupAxis: 'activity',
  serverSorted: true,
  isIncoming: false,
  pageSize: null,
  buildParams(ctx) {
    const p = new URLSearchParams({
      limit: '50',
      offset: '0',
    });
    p.set('include', 'serials');
    p.set('view', 'scanned');
    p.set('sort', 'priority');
    if (ctx.listSearch) p.set('search', ctx.listSearch);
    applyStaffParam(p, ctx);
    if (ctx.queueStage) p.set('ustage', ctx.queueStage);
    if (ctx.queueLane) p.set('ulane', ctx.queueLane);
    if (ctx.priorityOnly) p.set('priority_only', '1');
    applyTrackingInParam(p, ctx);
    return p;
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'unbox_queue',
      ctx.listSearch,
      ctx.staffFilterId ?? 'all',
      ctx.queueStage ?? 'all',
      ctx.queueLane ?? 'all',
      ctx.priorityOnly ? 'priority' : 'all',
    ] as const;
  },
  skipWeekFilter() {
    return true;
  },
  emptyMessage(ctx) {
    return ctx.listSearch
      ? 'No queue cartons match — try different text.'
      : ctx.priorityOnly
        ? 'No urgent cartons in the door queue.'
        : 'No cartons in the door queue. Triage matched POs land here.';
  },
};

/** Unbox · Viewed — lines this operator recently opened (per-staff server feed). */
const unboxViewedMode: ReceivingModeDescriptor = {
  id: 'unbox_viewed',
  apiView: 'viewed',
  groupAxis: 'activity',
  serverSorted: true,
  isIncoming: false,
  pageSize: null,
  buildParams(ctx) {
    const p = new URLSearchParams({
      limit: String(RECEIVING_TABLE_LIMIT),
      offset: '0',
    });
    p.set('include', 'serials');
    p.set('view', 'viewed');
    if (ctx.listSearch) p.set('search', ctx.listSearch);
    applyStaffParam(p, ctx);
    return p;
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'viewed',
      'unbox_viewed',
      ctx.listSearch,
      ctx.staffFilterId ?? 'all',
    ] as const;
  },
  skipWeekFilter() {
    return true;
  },
  emptyMessage(ctx) {
    return ctx.listSearch
      ? 'No viewed lines match — try different text.'
      : 'Nothing viewed yet. Open a carton to build your recent list.';
  },
};

const historyMode: ReceivingModeDescriptor = {
  id: 'history',
  // 'activity' = Unbox-touched / unboxed work (not door-scan-only). History is
  // the log of what was opened or received on Unbox; under 'all' the incoming
  // POs leak in. See receiving-views.ts.
  apiView: 'activity',
  groupAxis: 'activity',
  serverSorted: false,
  isIncoming: false,
  pageSize: null,
  buildParams(ctx) {
    const p = new URLSearchParams({
      // The ENTIRE timeline (operator 2026-09-14) — history is the log, not a
      // funnel page; the server lifts the cap for view=activity to match.
      limit: String(RECEIVING_HISTORY_LIMIT),
      offset: '0',
    });
    p.set('include', 'serials');
    p.set('view', 'activity');
    if (ctx.historySearch) p.set('search', ctx.historySearch);
    p.set('search_field', ctx.historySearchField);
    p.set('search_scope', ctx.historySearchScope);
    // Always send sort so the server window matches the client axis (default
    // unboxed is omitted from the browser URL but must reach the API).
    p.set('sort', normalizeHistorySort(ctx.historySort));
    applyStaffParam(p, ctx);
    return p;
  },
  skipWeekFilter(ctx) {
    // ALL TIME by default (operator 2026-09-14:
    // ALL TIME by default (operator 2026-09-14: "the inbound history displays
    return (
      ctx.historyWeekExplicit !== true
      || ctx.historySearch.length > 0
      || ctx.historySearchScope !== 'all'
    );
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'activity',
      'history',
      ctx.historySearch,
      ctx.historySearchField,
      ctx.historySearchScope,
      normalizeHistorySort(ctx.historySort),
      ctx.staffFilterId ?? 'all',
    ] as const;
  },
  emptyMessage(ctx) {
    return ctx.historySearch || ctx.historySearchScope !== 'all'
      ? 'No lines match — try different text or widen source (All).'
      : 'No lines yet — start scanning to populate.';
  },
};

const incomingMode: ReceivingModeDescriptor = {
  id: 'incoming',
  // Server filters to EXPECTED Zoho POs with zero received.
  apiView: 'incoming',
  groupAxis: 'po_date',
  serverSorted: true,
  isIncoming: true,
  pageSize: INCOMING_PAGE_SIZE,
  buildParams(ctx) {
    const limit = INCOMING_PAGE_SIZE;
    const offset = (ctx.incomingPage - 1) * INCOMING_PAGE_SIZE;
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    p.set('include', 'serials');
    p.set('view', 'incoming');
    // Incoming reuses the server's `search` / `search_field` machinery,
    // defaulting to PO# matching (mirrors Zoho's PO-list search UX).
    if (ctx.incomingSearch) {
      p.set('search', ctx.incomingSearch);
      p.set('search_field', 'po');
    }
    if (ctx.incomingState) p.set('delivery_state', ctx.incomingState);
    if (ctx.incomingSort) p.set('sort', ctx.incomingSort);
    if (ctx.incomingPoFrom) p.set('po_from', ctx.incomingPoFrom);
    if (ctx.incomingPoTo) p.set('po_to', ctx.incomingPoTo);
    // Purchasing-source tab → server `?inbound=` facet. `all` is the default
    // (no param); `zoho`/`ebay` narrow to that account.
    if (ctx.incomingSource !== 'all') p.set('inbound', ctx.incomingSource);
    applyTrackingInParam(p, ctx);
    return p;
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'incoming',
      'incoming',
      ctx.incomingSearch,
      ctx.incomingState ?? '',
      ctx.incomingSort,
      ctx.incomingPoFrom,
      ctx.incomingPoTo,
      ctx.incomingSource,
      ctx.incomingPage,
      // The paste changes the SERVER answer (it relaxes the lane), so it must
      // key the cache or a filtered fetch would serve the unfiltered rows.
      ctx.trackingIn.join(','),
    ] as const;
  },
  skipWeekFilter() {
    // Server already narrows to unreceived POs; a client week slice would hide
    // POs issued more than a week ago.
    return true;
  },
  emptyMessage(ctx) {
    // A paste DROPS the vendor-receipt guard server-side (`build-sql.ts` → "The vendor-receipt guard is dropped entirely under…
    if (ctx.trackingIn.length > 0) {
      return 'None of these tracking numbers are on Incoming — the tracking list says where each one went.';
    }
    if (ctx.isDeliveredUnscannedFacet) {
      return 'Nothing delivered-and-unscanned right now.';
    }
    if (ctx.isDeliveredNotUnboxedFacet) {
      return 'Nothing delivered-and-not-unboxed right now.';
    }
    if (ctx.incomingSource === 'ebay') {
      return 'No eBay purchases yet — Import to sync linked buyer accounts.';
    }
    return 'No incoming POs — Zoho says everything issued is already received.';
  },
};

/** Incoming · Recently removed (`?incview=removed`) — "where did it go". */
const incomingRemovedMode: ReceivingModeDescriptor = {
  id: 'incoming_removed',
  apiView: 'incoming_removed',
  groupAxis: 'po_date',
  serverSorted: true,
  isIncoming: true,
  pageSize: INCOMING_PAGE_SIZE,
  buildParams(ctx) {
    const p = new URLSearchParams({
      limit: String(INCOMING_PAGE_SIZE),
      offset: String((ctx.incomingPage - 1) * INCOMING_PAGE_SIZE),
    });
    p.set('view', 'incoming_removed');
    if (ctx.incomingSearch) {
      p.set('search', ctx.incomingSearch);
      p.set('search_field', 'po');
    }
    if (ctx.incomingSource !== 'all') p.set('inbound', ctx.incomingSource);
    // The lane is where a fruitless paste lands, so it must accept one.
    applyTrackingInParam(p, ctx);
    // No `sort` / `delivery_state` / PO-date range: this lane is ordered by WHEN
    // each row left, and a delivery-state facet describes rows still in flight.
    return p;
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'incoming',
      'incoming_removed',
      ctx.incomingSearch,
      ctx.incomingSource,
      ctx.incomingPage,
      ctx.trackingIn.join(','),
    ] as const;
  },
  skipWeekFilter() {
    // The server already bounds this lane to its own recency window; a client
    // week slice would hide departures from earlier in that window.
    return true;
  },
  emptyMessage(ctx) {
    if (ctx.trackingIn.length > 0) {
      return 'None of those tracking numbers left Incoming in the last 7 days.';
    }
    return 'Nothing has left Incoming in the last 7 days.';
  },
};

export const RECEIVING_MODES: Record<ReceivingTableMode, ReceivingModeDescriptor> = {
  receive: receiveMode,
  history: historyMode,
  incoming: incomingMode,
  incoming_removed: incomingRemovedMode,
  unbox_queue: unboxQueueMode,
  unbox_viewed: unboxViewedMode,
};

/** Convenience: resolve `?mode=` straight to its descriptor. */
export function getReceivingModeDescriptor(
  raw: string | null | undefined,
): ReceivingModeDescriptor {
  return RECEIVING_MODES[resolveReceivingTableMode(raw)];
}

/** Resolve a concrete table mode id (incl. Unbox tab modes) to its descriptor. */
export function getReceivingTableModeDescriptor(
  mode: ReceivingTableMode,
): ReceivingModeDescriptor {
  return RECEIVING_MODES[mode];
}

/** Build the search-param key shared with the history free-text box. */
const RECEIVING_SEARCH_PARAM_KEY = RECEIVING_HISTORY_URL_PARAMS.q;
