/** Receiving sidebar-rail feed descriptors + fetchers — the declarative SoT for every rail on the receiving page. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingRailRowTitleMode } from '@/lib/receiving/po-group-title';
import type { ApiResponse } from '@/components/sidebar/receiving/RecentActivityRailBase';
import {
  transformUnboxOpenedRows,
  UNBOX_SIDEBAR_LIMIT,
} from '@/lib/receiving/rail/unbox-opened-rows';
import { getTestingOpenedAt, type RailStatusId } from './status';
import type { RailQtyId } from './quantity';
import type { RailRowActionsId } from './row-actions';
import {
  toStubRow,
  type UnfoundQueueRow,
} from './unfound-stub';
import { QC_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import type { RefreshDomain } from '@/lib/refresh/domains';

type ReceivingLinesView = 'activity' | 'scanned' | 'viewed' | 'unbox_opened' | 'testing_opened';
type ReceivingLinesSort = 'unboxed_newest' | 'priority';

/** Runtime inputs the rail supplies to a fetcher (URL-derived). */
export interface RailFetchRuntime {
  /** `?staff=` filter, when the feed is staff-scoped. */
  staffId?: number | null;
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
  /** Refresh domains this rail renders (see `@/lib/refresh/domains`) — the rail's only refresh signal. */
  refreshDomains: readonly RefreshDomain[];
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
  /** When false, the rail ignores `receiving-line-deleted` and only exits on carton delete/dismiss (`receiving-entry-deleted` / cache remove). */
  listenLineDelete?: boolean;
  /** When false, the rail does NOT subscribe to `receiving-line-updated`. */
  acceptLineUpdateBus?: boolean;
  // OR a custom multi-source fetch (combined / unfound-queue):
  buildFetcher?: (
    rt: RailFetchRuntime,
    opts?: { limit?: number },
  ) => () => Promise<ApiResponse>;
}

/** Both receiving rails render the lines list. */
const RECEIVING_RAIL_DOMAINS = ['receiving.lines'] as const satisfies readonly RefreshDomain[];
const TESTING_RAIL_DOMAINS = ['orders.outbound', 'testing.lines'] as const satisfies readonly RefreshDomain[];

const notUnmatched = (r: ReceivingLineRow) => r.receiving_source !== 'unmatched';

/** Best-available recency for the combined sort (newest scanned first). */
function recencyMs(row: ReceivingLineRow): number {
  for (const c of [row.received_at, row.last_activity_at, row.scanned_at, row.created_at]) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** Standard `/api/receiving-lines` fetch (view + sort + staff + post filter). */
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

/** Triage / door-queue age axis — intake time only. */
function triageDoorScanAt(row: ReceivingLineRow): string | null {
  return row.scanned_at ?? row.received_at ?? row.last_activity_at ?? null;
}

/** Unfound-queue rows mapped to stub lines (the combined feed's unfound half). */
async function fetchUnfoundStubs(): Promise<ReceivingLineRow[]> {
  const res = await fetch(
    '/api/receiving/unfound-queue?kind=unmatched_receiving&checked=false&limit=200&exclude_unbox_intake=true',
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('unfound queue fetch failed');
  const data = (await res.json()) as { rows?: UnfoundQueueRow[] };
  return (data.rows ?? [])
    .filter((r) => Number.isFinite(Number(r.source_id)))
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
      fetchUnfoundStubs().catch(() => [] as ReceivingLineRow[]),
    ]);
    // IMPORTANT: keep triage stable by carton identity.
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
function buildUnboxReceivedFetcher(
  rt: RailFetchRuntime,
  opts?: { limit?: number },
): () => Promise<ApiResponse> {
  return async () => {
    // `limit` is overridable because a `ReceivingLineRow` is a FAT record — photos, serials, rail title context — and this feed's default page…
    const opened = await fetchReceivingLines(UNBOX_OPENED_SOURCE, rt, {
      limit: opts?.limit ?? UNBOX_SIDEBAR_LIMIT,
      includeSerials: false,
    }).then((d) => d.receiving_lines);

    // Dedup by carton (preserving SQL first-open order), stamp title context, and
    // attach the durable `carton:{id}` client_event_id — shared with the RSC
    // first-paint seed so the two never drift. See `./unbox-opened-rows`.
    const merged = transformUnboxOpenedRows(opened);

    return { success: true, receiving_lines: merged, total: merged.length };
  };
}

const TESTING_SIDEBAR_LIMIT = 50;

function buildTestingOpenedFetcher(): () => Promise<ApiResponse> {
  return async () => {
    const params = new URLSearchParams({
      limit: String(TESTING_SIDEBAR_LIMIT),
      offset: '0',
      view: 'testing_opened',
    });
    const res = await fetch(`${QC_RECEIVING_LINES_API}?${params.toString()}`);
    if (!res.ok) throw new Error('testing opened fetch failed');
    const data = (await res.json()) as ApiResponse;
    const rows = data.receiving_lines ?? [];
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
    // First-load reveal is a left→right slide-in cascade (x:
    staggerRevealMotion: 'slide',
    // One row per carton — line deletes retarget the carton row in place.
    listenLineDelete: false,
    // Mode isolation: ignore shared line-update bus (title via carton helper).
    acceptLineUpdateBus: false,
    // Honors the shared `?staff=` header filter (P1-WORK-02):
    usesStaffFilter: true,
    limit: UNBOX_SIDEBAR_LIMIT,
    refreshDomains: RECEIVING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
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
    limit: 200,
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
    // QC rows are lines another surface owns — share a link, nothing more.
    rowActions: 'testing',
    buildFetcher: buildTestingOpenedFetcher,
    getActivityAt: getTestingOpenedAt,
    pinSelectedLead: false,
    preserveServerOrder: true,
    staggerRevealMotion: 'slide',
    acceptLineUpdateBus: false,
    limit: TESTING_SIDEBAR_LIMIT,
    refreshDomains: TESTING_RAIL_DOMAINS,
    rowTitleMode: 'adaptive-po',
  },
} satisfies Record<string, ReceivingRailFeed>;

/** Feed ids — the key a rail binds by (`feed="unboxRecent"`). */
export type ReceivingRailFeedId = keyof typeof FEEDS;

// Re-typed so an indexed lookup `RECEIVING_RAIL_FEEDS[id]` widens to the full `ReceivingRailFeed` (every optional present) rather than the…
export const RECEIVING_RAIL_FEEDS: Record<ReceivingRailFeedId, ReceivingRailFeed> = FEEDS;
