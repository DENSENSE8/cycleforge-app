/**
 * Receiving sidebar-rail feed descriptors + fetchers — the declarative SoT for
 * every rail on the receiving page. Each rail wrapper was re-deriving the same
 * four things by hand (a `/api/receiving-lines` fetch, a query key, a quantity
 * strategy, and status/event wiring); this module pulls the data half into one
 * place so a rail is now a descriptor entry, not a bespoke component.
 *
 * The feeds, all consumed through `ReceivingFeedRail`:
 *   - unboxRecent  → Unboxed       (view=unbox_opened ONLY — SQL first-open order,
 *                                   `unbox_opened_at` age axis, preserveServerOrder)
 *   - unboxQueue   → Door queue    (triage door-scans mirrored into Unbox; own segment)
 *   - scanned      → Queue/Prioritize (view=scanned, sort=priority, no unmatched)
 *   - viewed       → Viewed        (view=viewed, per-staff recents)
 *   - triageCombined → Triage      (scanned ∪ unfound, door-scan recency)
 *   - triageUnfound  → Unfound     (unfound-queue stubs)
 *   - triageDone     → Done        (triage_complete stubs)
 *   - searchRecent   → Recently searched (`/search` rail; same view=viewed feed)
 *   - testingRecent  → QC Recent (view=testing_opened, testing_opened_at axis,
 *                                   preserveServerOrder; Testing API only)
 *
 * Stable identity matters: `refreshEvents` arrays and the `getActivityAt` fns are
 * module-scope so the rail shell's listener effects subscribe once (a fresh
 * array/arrow each render risked a dropped optimistic event mid-swap).
 *
 * Scope: receiving rails plus QC Recent (`testingRecent`). Mobile scan feeds
 * share the QC endpoint via the same view.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingRailRowTitleMode } from '@/lib/receiving/po-group-title';
import type { ApiResponse } from '@/components/sidebar/receiving/RecentActivityRailBase';
import {
  transformUnboxOpenedRows,
  UNBOX_SIDEBAR_LIMIT,
} from '@/lib/receiving/rail/unbox-opened-rows';
import { getViewedAt, getTestingOpenedAt, type RailStatusId } from './status';
import type { RailQtyId } from './quantity';
import type { RailRowActionsId } from './row-actions';
import {
  toStubRow,
  matchesQuery as matchesUnfoundQueue,
  type UnfoundQueueRow,
} from './unfound-stub';
import {
  toDoneStubRow,
  matchesDoneQuery,
  type TriageDoneRow,
} from './done-stub';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import { TESTING_LINE_OPENED_EVENT } from '@/lib/testing/testing-line-opened-event';
import type { RefreshDomain } from '@/lib/refresh/domains';

type ReceivingLinesView = 'activity' | 'scanned' | 'viewed' | 'unbox_opened' | 'testing_opened';
type ReceivingLinesSort = 'unboxed_newest' | 'priority';

/** Runtime inputs the rail supplies to a fetcher (URL-derived). */
export interface RailFetchRuntime {
  /** `?staff=` filter, when the feed is staff-scoped. */
  staffId?: number | null;
  /** Already trimmed + lowercased search text; '' = no filter. */
  query?: string;
}

/** Narrow spec the standard `/api/receiving-lines` fetcher reads. */
interface ReceivingLinesQuery {
  segment: string;
  view: ReceivingLinesView;
  sort?: ReceivingLinesSort;
  /** Client-side post-filter (e.g. drop unmatched). */
  postFilter?: (r: ReceivingLineRow) => boolean;
}

/** A declarative rail feed. `buildFetcher` (multi-source) takes precedence over `view`. */
interface ReceivingRailFeed {
  /** Cache segment → ['receiving-lines-table','rail',segment,…]. */
  segment: string;
  eyebrowTitle: string;
  qty: RailQtyId;
  status: RailStatusId;
  /**
   * Which verbs this feed's rows offer in their ⋮ menu (see `./row-actions`).
   * Omit and the rail paints no row menu at all.
   */
  rowActions?: RailRowActionsId;
  /** Module-scope array — stable identity for the shell's refresh listener. */
  refreshEvents: string[];
  /** Refresh domains this rail renders (see `@/lib/refresh/domains`). */
  refreshDomains?: readonly RefreshDomain[];
  autoSelectFirstWhenEmpty?: boolean;
  /** Gate for auto-select — omit to use the receiving-page default. */
  canAutoSelectFirst?: () => boolean;
  /** false ONLY for the unbox Recent feed (strict unboxed_at order, no pin bounce). */
  pinSelectedLead?: boolean;
  /**
   * When true, trust SQL/fetcher order — shell does not re-sort by getActivityAt.
   * Unboxed sets this so first-open is the only axis.
   */
  preserveServerOrder?: boolean;
  /**
   * First-load stagger motion for the rail shell. Unboxed uses `slide` so new
   * rows enter from the left (matches CRUD `sidebarRailRow` presence).
   * Defaults to the shell's `sidebar` (opacity + y settle) when omitted.
   */
  staggerRevealMotion?: 'slide' | 'rise' | 'sidebar';
  /** Whether the feed reads the `?staff=` param. */
  usesStaffFilter?: boolean;
  limit?: number;
  /** Row time-label axis — MUST match `sort`. Omit to use the shell default. */
  getActivityAt?: (r: ReceivingLineRow) => string | null | undefined;
  // Standard receiving-lines fetch:
  view?: ReceivingLinesView;
  sort?: ReceivingLinesSort;
  postFilter?: (r: ReceivingLineRow) => boolean;
  /** Row title axis — `adaptive-po` for single-SKU product vs multi-SKU PO summary. */
  rowTitleMode?: ReceivingRailRowTitleMode;
  /** Stamp `rail_title_context` after fetch (`po` = group by PO key). */
  stampRailTitleContext?: 'po';
  /**
   * When false, the rail ignores `receiving-line-deleted` and only exits on
   * carton delete/dismiss (`receiving-entry-deleted` / cache remove). Used by
   * Unboxed (one row per carton) so removing a line inside a carton retargets
   * the same `carton:{id}` row instead of exit+enter.
   */
  listenLineDelete?: boolean;
  /**
   * When false, the rail does NOT subscribe to `receiving-line-updated`.
   * Unboxed opts out so Testing/workspace rich patches (serials, type, workflow,
   * by-id dumps) cannot mutate age/qty/status — title renames go through
   * `patchUnboxRailTitleByCarton` only. Default true (triage / queue / viewed).
   */
  acceptLineUpdateBus?: boolean;
  // OR a custom multi-source fetch (combined / unfound-queue):
  buildFetcher?: (rt: RailFetchRuntime) => () => Promise<ApiResponse>;
}

// NOTE: `receiving-entry-deleted` is deliberately NOT a refresh event. The rail
// already binds it as `deleteGroupEvent` (ReceivingFeedRail) — which SURGICALLY
// drops just the deleted carton's rows and sticky-suppresses its id so a later
// fetch can't resurrect it. Listing it here too made a delete ALSO trigger a
// full-list refetch, which needlessly re-rendered (and could race to empty) the
// whole rail. A delete must only remove that id, never refresh the entire list.
const TRIAGE_REFRESH: string[] = [
  'receiving-triage-refresh',
  'receiving-entry-added',
];

const UNBOX_REFRESH: string[] = ['receiving-unbox-refresh'];

const TESTING_REFRESH: string[] = ['testing-result-recorded', TESTING_LINE_OPENED_EVENT];

/** Both receiving rails render the lines list. */
const RECEIVING_RAIL_DOMAINS = ['receiving.lines'] as const satisfies readonly RefreshDomain[];
const TESTING_RAIL_DOMAINS = ['orders.outbound'] as const satisfies readonly RefreshDomain[];

const notUnmatched = (r: ReceivingLineRow) => r.receiving_source !== 'unmatched';

/** Search match for a real receiving line (tracking / sku / item / PO). */
function matchesReceivingLine(row: ReceivingLineRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.tracking_number,
    row.sku,
    row.item_name,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
  ].map((x) => (x || '').toLowerCase());
  return hay.some((h) => h.includes(q));
}

/** Best-available recency for the combined sort (newest scanned first). */
function recencyMs(row: ReceivingLineRow): number {
  for (const c of [row.received_at, row.last_activity_at, row.scanned_at, row.created_at]) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** Standard `/api/receiving-lines` fetch (view + sort + staff + post/query filter). */
export async function fetchReceivingLines(
  spec: ReceivingLinesQuery,
  rt: RailFetchRuntime,
  opts?: { limit?: number; includeSerials?: boolean },
): Promise<ApiResponse> {
  const limit = opts?.limit ?? 50;
  const includeSerials = opts?.includeSerials ?? false;
  const params = new URLSearchParams({ limit: String(limit), offset: '0' });
  if (includeSerials) params.set('include', 'serials');
  params.set('view', spec.view);
  if (spec.sort) params.set('sort', spec.sort);
  if (rt.staffId != null) params.set('staff', String(rt.staffId));
  const res = await fetch(`/api/receiving-lines?${params.toString()}`);
  if (!res.ok) throw new Error(`${spec.segment} fetch failed`);
  const data = (await res.json()) as ApiResponse;
  let rows = data.receiving_lines ?? [];
  if (spec.postFilter) rows = rows.filter(spec.postFilter);
  const q = (rt.query ?? '').trim().toLowerCase();
  if (q) rows = rows.filter((r) => matchesReceivingLine(r, q));
  return { success: true, receiving_lines: rows, total: rows.length };
}

// Triage "Prioritize" — door-scanned matched cartons, priority-sorted.
const SCANNED_SOURCE: ReceivingLinesQuery = {
  segment: 'scanned',
  view: 'scanned',
  sort: 'priority',
  postFilter: notUnmatched,
};

// Unbox "Queue" — triage door-scanned matched POs (isolated cache segment `unbox-queue`).

/** Scanned subset rows (reused by triage Prioritize + combined feed). */
async function fetchScannedRows(rt: RailFetchRuntime): Promise<ReceivingLineRow[]> {
  return (await fetchReceivingLines(SCANNED_SOURCE, rt)).receiving_lines;
}

// Unbox "Received" matched source — recently UNBOXED cartons (view=activity).
// Merged with new door-scans + unfound in buildUnboxReceivedFetcher; the
// per-source order is irrelevant since the union is re-sorted by received recency.
// Unbox sidebar — cartons scanned on the Unbox surface (ops UNBOX_SCAN_OPENED).
const UNBOX_OPENED_SOURCE: ReceivingLinesQuery = {
  segment: 'unbox-opened',
  view: 'unbox_opened',
};

/** Cartons opened via a scan on the Unbox workspace (found + unfound). */
export async function fetchUnboxOpenedRows(rt: RailFetchRuntime): Promise<ReceivingLineRow[]> {
  return (await fetchReceivingLines(UNBOX_OPENED_SOURCE, rt)).receiving_lines;
}

/**
 * Unbox-open stamp for the Unboxed rail age label — first-open
 * (`unbox_opened_at`) only. Never triage door-scan / received / created times.
 * Sort order is owned by SQL + preserveServerOrder (this helper is not a sorter).
 */
export function unboxOpenedRecencyMs(row: ReceivingLineRow): number {
  const at = row.unbox_opened_at ?? null;
  if (!at) return 0;
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Triage / door-queue age axis — intake time only.
 * Prefer door-scan / received; fall back to `last_activity_at` for unfound/done
 * stubs that fold intake into that field. Never bare `created_at` or
 * `unbox_opened_at` (those are Unbox axes).
 */
function triageDoorScanAt(row: ReceivingLineRow): string | null {
  return row.scanned_at ?? row.received_at ?? row.last_activity_at ?? null;
}

/** Unfound-queue rows mapped to stub lines (reused by the unfound + combined feeds). */
async function fetchUnfoundStubs(rt: RailFetchRuntime): Promise<ReceivingLineRow[]> {
  const res = await fetch(
    '/api/receiving/unfound-queue?kind=unmatched_receiving&checked=false&limit=200&exclude_unbox_intake=true',
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('unfound queue fetch failed');
  const data = (await res.json()) as { rows?: UnfoundQueueRow[] };
  const q = (rt.query ?? '').trim().toLowerCase();
  return (data.rows ?? [])
    .filter((r) => Number.isFinite(Number(r.source_id)))
    .filter((r) => matchesUnfoundQueue(r, q))
    .map(toStubRow);
}

/**
 * Triage combined feed — Prioritize ∪ Unfound in one list, newest-scanned first.
 * Reuses the EXACT same two subset fetchers (never a divergent third query), and
 * degrades: a failing source resolves empty so the other still lists.
 */
function buildTriageCombinedFetcher(rt: RailFetchRuntime): () => Promise<ApiResponse> {
  return async () => {
    const [scanned, unfound] = await Promise.all([
      fetchScannedRows(rt).catch(() => [] as ReceivingLineRow[]),
      fetchUnfoundStubs(rt).catch(() => [] as ReceivingLineRow[]),
    ]);
    // IMPORTANT: keep triage stable by carton identity. When an unfound carton
    // becomes matched, it moves between the two source queries; without a stable
    // identity this appears as a delete+add flicker. Dedup to one row per carton
    // (receiving_id) and key the row by a durable client_event_id so React Query
    // reconciliation updates in place.
    const bestByCarton = new Map<number, ReceivingLineRow>();
    for (const row of [...scanned, ...unfound]) {
      const rid = row.receiving_id;
      if (rid == null || !Number.isFinite(Number(rid))) continue;
      const existing = bestByCarton.get(rid);
      if (!existing) {
        bestByCarton.set(rid, row);
        continue;
      }
      // Prefer scanned (matched) over unfound when both exist; else keep the
      // newest by recency.
      const existingIsUnmatched = existing.receiving_source === 'unmatched';
      const nextIsUnmatched = row.receiving_source === 'unmatched';
      if (existingIsUnmatched && !nextIsUnmatched) {
        bestByCarton.set(rid, row);
        continue;
      }
      if (existingIsUnmatched === nextIsUnmatched && recencyMs(row) > recencyMs(existing)) {
        bestByCarton.set(rid, row);
      }
    }
    const merged = Array.from(bestByCarton.values())
      .map((r) => ({
        ...r,
        // Stable per-carton identity for the combined feed only.
        client_event_id: `carton:${r.receiving_id}`,
      }))
      .sort((a, b) => recencyMs(b) - recencyMs(a));
    return { success: true, receiving_lines: merged, total: merged.length };
  };
}

/**
 * Unbox "Unboxed" feed — every carton scanned on the Unbox surface (found or
 * unfound). Order is SQL first-open only — do not client-re-sort.
 */
function buildUnboxReceivedFetcher(rt: RailFetchRuntime): () => Promise<ApiResponse> {
  return async () => {
    const opened = await fetchReceivingLines(UNBOX_OPENED_SOURCE, rt, {
      limit: UNBOX_SIDEBAR_LIMIT,
      includeSerials: false,
    }).then((d) => d.receiving_lines);

    // Dedup by carton (preserving SQL first-open order), stamp title context, and
    // attach the durable `carton:{id}` client_event_id — shared with the RSC
    // first-paint seed so the two never drift. See `./unbox-opened-rows`.
    const merged = transformUnboxOpenedRows(opened);

    return { success: true, receiving_lines: merged, total: merged.length };
  };
}

/** Unfound feed — unmatched cartons (no PO yet) as stub lines. */
function buildUnfoundFetcher(rt: RailFetchRuntime): () => Promise<ApiResponse> {
  return async () => {
    const rows = await fetchUnfoundStubs(rt);
    return { success: true, receiving_lines: rows, total: rows.length };
  };
}

/** Done-tab rows (`receiving.triage_complete = true`) mapped to stub lines. */
async function fetchDoneStubs(rt: RailFetchRuntime): Promise<ReceivingLineRow[]> {
  const params = new URLSearchParams({ limit: '200' });
  if (rt.query) params.set('q', rt.query);
  const res = await fetch(`/api/receiving/triage/done?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('triage done fetch failed');
  const data = (await res.json()) as { rows?: TriageDoneRow[] };
  const q = (rt.query ?? '').trim().toLowerCase();
  return (data.rows ?? []).filter((r) => matchesDoneQuery(r, q)).map(toDoneStubRow);
}

/** Done feed — cartons staged + saved for unbox, newest-completed first. */
function buildDoneFetcher(rt: RailFetchRuntime): () => Promise<ApiResponse> {
  return async () => {
    const rows = await fetchDoneStubs(rt);
    return { success: true, receiving_lines: rows, total: rows.length };
  };
}

const TESTING_SIDEBAR_LIMIT = 50;

function buildTestingOpenedFetcher(rt: RailFetchRuntime): () => Promise<ApiResponse> {
  return async () => {
    const params = new URLSearchParams({
      limit: String(TESTING_SIDEBAR_LIMIT),
      offset: '0',
      view: 'testing_opened',
    });
    const res = await fetch(`${TESTING_RECEIVING_LINES_API}?${params.toString()}`);
    if (!res.ok) throw new Error('testing opened fetch failed');
    const data = (await res.json()) as ApiResponse;
    let rows = data.receiving_lines ?? [];
    const q = (rt.query ?? '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => matchesReceivingLine(r, q));
    return { success: true, receiving_lines: rows, total: rows.length };
  };
}

const FEEDS = {
  /**
   * Unbox "Unboxed" rail — cartons scanned on the Unbox surface only
   * (`view=unbox_opened`). No triage activity fallback.
   */
  unboxRecent: {
    segment: 'received',
    eyebrowTitle: 'Unboxed',
    qty: 'received',
    status: 'unbox-recent',
    rowActions: 'receiving',
    buildFetcher: buildUnboxReceivedFetcher,
    // Unboxed rail time axis = first Unbox-open (`unbox_opened_at`). Stable —
    // a re-scan opens the carton but does not rewrite this stamp / reorder.
    getActivityAt: (r) => r.unbox_opened_at ?? null,
    pinSelectedLead: false,
    // Server owns sort (first-open). Shell must not re-sort by getActivityAt.
    preserveServerOrder: true,
    // First-load reveal is a left→right slide-in cascade (x: -12 → 0), matching
    // the scan-dock / CRUD `framerPresence.sidebarRailRow` entrance language. Rows
    // fade in from fully transparent (not a dim gray hold) so the slide reads as a
    // clean entrance rather than "grayed rows that jump" — see
    // `staggerRevealSidebarSlideItem`.
    staggerRevealMotion: 'slide',
    // One row per carton — line deletes retarget the carton row in place.
    listenLineDelete: false,
    // Mode isolation: ignore shared line-update bus (title via carton helper).
    acceptLineUpdateBus: false,
    // Honors the shared `?staff=` header filter (P1-WORK-02): the server's
    // view=unbox_opened staff clause matches on the unbox actor (unbox_opened_by
    // / UNBOX_SCAN_OPENED). Absent param = ALL staff (unchanged default).
    // Window capped at UNBOX_SIDEBAR_LIMIT.
    usesStaffFilter: true,
    autoSelectFirstWhenEmpty: false,
    limit: UNBOX_SIDEBAR_LIMIT,
    refreshEvents: UNBOX_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
  },
  /**
   * Unbox "Queue" — triage door-scanned matched POs waiting to unbox. The only
   * feed that reads triage intake data inside Unbox mode.
   */
  unboxQueue: {
    segment: 'unbox-queue',
    eyebrowTitle: 'Door queue',
    qty: 'scanned',
    status: 'receiving',
    rowActions: 'receiving',
    view: 'scanned',
    sort: 'priority',
    postFilter: notUnmatched,
    getActivityAt: triageDoorScanAt,
    usesStaffFilter: true,
    autoSelectFirstWhenEmpty: false,
    limit: 50,
    refreshEvents: [...UNBOX_REFRESH, 'receiving-triage-refresh'],
    refreshDomains: RECEIVING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
    stampRailTitleContext: 'po',
  },
  /** Triage "Prioritize" — door-scanned matched cartons, not yet unboxed. */
  scanned: {
    segment: 'scanned',
    eyebrowTitle: 'At dock',
    qty: 'scanned',
    status: 'receiving',
    rowActions: 'receiving',
    view: 'scanned',
    sort: 'priority',
    postFilter: notUnmatched,
    getActivityAt: triageDoorScanAt,
    usesStaffFilter: true,
    autoSelectFirstWhenEmpty: true,
    limit: 50,
    refreshEvents: TRIAGE_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
    stampRailTitleContext: 'po',
  },
  /** Unbox "Viewed" — lines this operator recently opened (per-staff). */
  viewed: {
    segment: 'viewed',
    eyebrowTitle: 'Viewed',
    qty: 'received',
    status: 'receiving',
    rowActions: 'receiving',
    view: 'viewed',
    getActivityAt: getViewedAt,
    autoSelectFirstWhenEmpty: false,
    refreshEvents: UNBOX_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
  },
  /** Triage default — Prioritize ∪ Unfound, newest-scanned first. */
  triageCombined: {
    segment: 'triage-combined',
    eyebrowTitle: 'Triage',
    qty: 'combined',
    status: 'receiving',
    rowActions: 'receiving',
    buildFetcher: buildTriageCombinedFetcher,
    getActivityAt: triageDoorScanAt,
    usesStaffFilter: true,
    autoSelectFirstWhenEmpty: true,
    limit: 200,
    refreshEvents: TRIAGE_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
  },
  /** Triage "Unfound" — cartons Zoho can't match to a PO yet. */
  triageUnfound: {
    segment: 'unfound',
    eyebrowTitle: 'Unfound',
    qty: 'unfound',
    status: 'receiving',
    rowActions: 'receiving',
    buildFetcher: buildUnfoundFetcher,
    getActivityAt: triageDoorScanAt,
    autoSelectFirstWhenEmpty: true,
    limit: 200,
    refreshEvents: TRIAGE_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
  },
  /**
   * `/search` "Recently searched" — the records this operator recently opened.
   *
   * Unbox's OWN feed shape (`view=viewed` → `receiving_line_views`, ordered by
   * this viewer's `viewed_at`), off `/api/receiving-lines`. That is the point:
   * the rows are real receiving lines, so they arrive carrying
   * `catalog_product_title` / `zoho_item_title` and the rail's normal title
   * resolver paints a PRODUCT TITLE — not the identifier the operator typed.
   *
   * It is also why `/search` needs no endpoint, no resolver, no row adapter and
   * no rail of its own: only a different eyebrow over a query the app already
   * answers. A stub feed off `search_recents` was tried and abandoned — that
   * table stores typed strings and no record, so it can only ever paint ids.
   */
  searchRecent: {
    segment: 'search-recent',
    eyebrowTitle: 'Recently searched',
    qty: 'received',
    status: 'receiving',
    rowActions: 'searchRecent',
    view: 'viewed',
    getActivityAt: getViewedAt,
    autoSelectFirstWhenEmpty: true,
    canAutoSelectFirst: () => {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      if ((params.get('sel') ?? '').trim()) return false;
      if ((params.get('q') ?? '').trim()) return false;
      return window.location.pathname.startsWith('/search');
    },
    // The server orders by this viewer's `viewed_at DESC` — "most recently
    // opened" is the axis, so a client re-sort could only fight it.
    preserveServerOrder: true,
    pinSelectedLead: false,
    staggerRevealMotion: 'slide',
    limit: 20,
    refreshEvents: UNBOX_REFRESH,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
  },
  /** Triage "Done" — cartons staged + saved for unbox (triage_complete = true). */
  triageDone: {
    segment: 'done',
    eyebrowTitle: 'Done',
    qty: 'unfound',
    status: 'receiving',
    rowActions: 'receiving',
    buildFetcher: buildDoneFetcher,
    getActivityAt: triageDoorScanAt,
    autoSelectFirstWhenEmpty: true,
    limit: 200,
    refreshEvents: [...TRIAGE_REFRESH, 'receiving-triage-completed'],
    refreshDomains: RECEIVING_RAIL_DOMAINS,
  },
  /**
   * Quality Control "Recent" — lines this operator opened on Testing
   * (`view=testing_opened`). Age = last QC-open only. Not career verdicts.
   */
  testingRecent: {
    segment: 'tested',
    eyebrowTitle: 'Recent',
    qty: 'tested',
    status: 'testing',
    buildFetcher: buildTestingOpenedFetcher,
    getActivityAt: getTestingOpenedAt,
    pinSelectedLead: false,
    preserveServerOrder: true,
    staggerRevealMotion: 'slide',
    acceptLineUpdateBus: false,
    autoSelectFirstWhenEmpty: false,
    limit: TESTING_SIDEBAR_LIMIT,
    refreshEvents: TESTING_REFRESH,
    refreshDomains: TESTING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
  },
} satisfies Record<string, ReceivingRailFeed>;

/** Feed ids — the key a rail binds by (`feed="unboxRecent"`). */
export type ReceivingRailFeedId = keyof typeof FEEDS;

// Re-typed so an indexed lookup `RECEIVING_RAIL_FEEDS[id]` widens to the full
// `ReceivingRailFeed` (every optional present) rather than the narrow per-key
// shape — otherwise feeds that omit `buildFetcher`/`view`/etc. would make those
// fields unreadable through the generic rail. Same object, so the module-scope
// fns + refreshEvents arrays keep their stable identity.
export const RECEIVING_RAIL_FEEDS: Record<ReceivingRailFeedId, ReceivingRailFeed> = FEEDS;
