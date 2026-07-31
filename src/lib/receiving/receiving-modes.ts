/**
 * Receiving lines-table mode registry.
 *
 * The right-pane lines table renders three distinct display types — Receive,
 * History, and Incoming — that share one mounted component (so react-query
 * cache + scroll position survive a tab flip) but differ in nearly every
 * data-layer decision: which API `view` to request, how to page, how to key the
 * query, how to group/sort rows, whether to skip week scoping, and what the
 * empty state reads.
 *
 * Historically those decisions lived as ~40 scattered `isHistoryMode` /
 * `isIncomingMode` ternaries inside the component. A single wrong branch =
 * cross-contamination (e.g. History rendering Incoming rows). This registry
 * makes each mode a self-contained descriptor: the table looks up the active
 * descriptor and delegates, so adding a mode means adding one entry and the
 * compiler forces every field to be answered.
 *
 * Pure data + functions only — no JSX, no React. The presentational fork
 * (which header component, which row chips) is driven off the boolean flags
 * here but rendered by the component.
 */

import {
  RECEIVING_HISTORY_URL_PARAMS,
  type ReceivingHistorySearchField,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import type { ReceivingView } from '@/lib/receiving/receiving-views';

/** Server-side page size for the Incoming list (other modes use a long scroll). */
export const INCOMING_PAGE_SIZE = 50;

/** Long-scroll row cap shared by the non-paginated modes (Receive / History). */
export const RECEIVING_TABLE_LIMIT = 500;

/**
 * The display modes the lines table itself knows how to render. The sidebar's
 * full `ReceivingMode` union also has `pickup` and `unfound`, but those are
 * handled upstream (a route switch / a different right-pane component), never
 * by this table — so they're intentionally absent here.
 *
 * Unbox workbench tabs (`?unboxview=`) resolve to `unbox_queue` / `unbox_viewed`
 * / `history` via {@link resolveUnboxReceivingTableMode} — not via `?mode=`.
 */
export type ReceivingTableMode =
  | 'receive'
  | 'history'
  | 'incoming'
  | 'unbox_queue'
  | 'unbox_viewed';

/**
 * Resolve the raw `?mode=` URL value to the table mode. Anything that isn't
 * `incoming` or `history` (including absent) is the default Receive workspace —
 * matching the prior `pageMode === 'history' ? … : 'receive'` fallback.
 * Unbox tab modes are never resolved from `?mode=` — see
 * {@link resolveUnboxReceivingTableMode}.
 */
export function resolveReceivingTableMode(raw: string | null | undefined): ReceivingTableMode {
  return raw === 'incoming' ? 'incoming' : raw === 'history' ? 'history' : 'receive';
}

/** Unbox workbench tab → lines-table mode (`recent` = History tab). */
export function resolveUnboxReceivingTableMode(
  tab: 'recent' | 'queue' | 'viewed',
): ReceivingTableMode {
  if (tab === 'queue') return 'unbox_queue';
  if (tab === 'viewed') return 'unbox_viewed';
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
 * History sort axes — each maps to a lifecycle timestamp for day-banding,
 * within-day order, and the server ORDER BY:
 *   • unboxed_newest — receiving.unboxed_at (default).
 *   • scanned_newest — first tracking scan / door scan.
 */
export const HISTORY_SORT_OPTIONS = [
  { id: 'unboxed_newest', label: 'Unboxed' },
  { id: 'scanned_newest', label: 'Scanned' },
] as const satisfies readonly ReceivingSortOption[];

/** Implicit default — omitted from the URL when active. */
export const HISTORY_DEFAULT_SORT = 'unboxed_newest';

/** Coerce an arbitrary `?sort=` to a valid History sort (default on miss). */
export function normalizeHistorySort(raw: string | null | undefined): string {
  const v = String(raw || '').trim().toLowerCase();
  return HISTORY_SORT_OPTIONS.some((o) => o.id === v) ? v : HISTORY_DEFAULT_SORT;
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

/**
 * Everything a descriptor needs from the URL, parsed by the component once and
 * handed to whichever descriptor is active. A flat bag (rather than per-mode
 * context types) keeps the call sites and the registry simple; each descriptor
 * reads only the fields relevant to it.
 */
export interface ReceivingModeContext {
  // History facets
  historySearch: string;
  historySearchField: ReceivingHistorySearchField;
  historySearchScope: ReceivingHistorySearchScope;
  /** History sort axis (`?sort=`); see HISTORY_SORT_OPTIONS. */
  historySort: string;
  // Incoming facets
  incomingSearch: string;
  incomingState: string | null;
  incomingSort: string;
  incomingPoFrom: string;
  incomingPoTo: string;
  incomingPage: number;
  /**
   * Purchasing-source tab (`?inbound=`): which account the incoming order came
   * from. `'all'` (default) unions every source; `'zoho'` narrows to Zoho POs;
   * `'ebay'` narrows to the eBay purchasing account (Universal Incoming). Maps
   * 1:1 to the server's `?inbound=` facet in `build-sql`.
   */
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
    if (ctx.queueStage) p.set('ustage', ctx.queueStage);
    if (ctx.queueLane) p.set('ulane', ctx.queueLane);
    applyStaffParam(p, ctx);
    return p;
  },
  queryKey(ctx) {
    return [
      QUERY_ROOT,
      'scanned',
      'unbox_queue',
      ctx.listSearch,
      ctx.staffFilterId ?? 'all',
      ctx.queueStage ?? 'all',
      ctx.queueLane ?? 'all',
    ] as const;
  },
  skipWeekFilter() {
    return true;
  },
  emptyMessage(ctx) {
    return ctx.listSearch
      ? 'No queue cartons match — try different text.'
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
  // 'activity' = 'all' minus untouched-incoming (EXPECTED, 0 received). History
  // is the log of what was actually scanned/unpacked; under 'all' the incoming
  // POs leak in. See receiving-views.ts.
  apiView: 'activity',
  groupAxis: 'activity',
  serverSorted: false,
  isIncoming: false,
  pageSize: null,
  sortOptions: HISTORY_SORT_OPTIONS,
  defaultSort: HISTORY_DEFAULT_SORT,
  buildParams(ctx) {
    const p = new URLSearchParams({
      limit: String(RECEIVING_TABLE_LIMIT),
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
  skipWeekFilter(ctx) {
    // Text or non-default source scope narrows globally — bypass week slicing
    // so matches stay visible regardless of when they were scanned.
    return ctx.historySearch.length > 0 || ctx.historySearchScope !== 'all';
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
    ] as const;
  },
  skipWeekFilter() {
    // Server already narrows to unreceived POs; a client week slice would hide
    // POs issued more than a week ago.
    return true;
  },
  emptyMessage(ctx) {
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

export const RECEIVING_MODES: Record<ReceivingTableMode, ReceivingModeDescriptor> = {
  receive: receiveMode,
  history: historyMode,
  incoming: incomingMode,
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
export const RECEIVING_SEARCH_PARAM_KEY = RECEIVING_HISTORY_URL_PARAMS.q;
