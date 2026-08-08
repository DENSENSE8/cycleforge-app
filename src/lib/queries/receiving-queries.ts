'use client';

import type { QueryClient } from '@tanstack/react-query';
import {
  dispatchReceivingPhotoChanged,
  type ReceivingPhotoChangedPayload,
} from '@/utils/events';
import type {
  ReceivingModeContext,
  ReceivingModeDescriptor,
} from '@/lib/receiving/receiving-modes';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Query-key roots for every receiving feed (Phase 1 of the receiving-triage
 * streamline — see docs/receiving-triage-streamline-plan.md §3.1).
 *
 * A single {@link invalidateReceivingFeeds} call refreshes all of them, so a
 * scan / receive mutation can never leave one rail stale because the wrong DOM
 * CustomEvent fired — the exact bug class that hid freshly-matched cartons from
 * the triage Prioritize tab (a matched scan only dispatched
 * `receiving-lines-prepended`, which the Prioritize rail did not listen to).
 *
 * `invalidateQueries` matches by key PREFIX, so each root covers every key
 * beneath it:
 *   ['receiving-lines-table']            → Prioritize rail, Recent/unbox rail, main table
 *   ['receiving']                        → triage Unfound list
 *   ['incoming-delivered-unscanned']     → delivered-but-not-scanned list
 *   ['receiving-lines-incoming-summary'] → Incoming tile counts
 *
 * New receiving feeds should key under one of these roots so this helper keeps
 * covering them with no extra wiring.
 */
const RECEIVING_FEED_ROOTS: ReadonlyArray<ReadonlyArray<string>> = [
  ['receiving-lines-table'],
  ['receiving'],
  ['incoming-delivered-unscanned'],
  ['receiving-lines-incoming-summary'],
  // Incoming to-do list seeded from unmatched shipping-email order numbers —
  // refetches when an email rescan / Zoho refresh / scan changes the worklist.
  ['receiving-lines-incoming-todo'],
];

// Wall-clock of the last LOCAL receiving-feed invalidation (a scan/receive on
// THIS client). The Ably `receiving-log.changed` echo of that same mutation
// arrives a beat later and would re-invalidate the desktop rails — a second
// refetch + flicker per scan. `receivingFeedsRecentlyInvalidatedLocally()` lets
// the realtime handler skip the two overlapping rail roots when the local
// optimistic invalidation already covered them (events from OTHER clients have
// no recent local stamp, so they still refresh normally).
let lastLocalReceivingInvalidationAt = 0;

/**
 * True when {@link invalidateReceivingFeeds} ran locally within `withinMs`.
 * The realtime invalidation handler consults this to suppress the redundant
 * echo-driven refetch of the desktop rails right after a local scan.
 */
export function receivingFeedsRecentlyInvalidatedLocally(withinMs = 800): boolean {
  return Date.now() - lastLocalReceivingInvalidationAt < withinMs;
}

/**
 * Invalidate every receiving feed so all rails + tiles refetch atomically.
 * Call this from any mutation that changes receiving state (scan, match,
 * mark-received) instead of hand-picking a CustomEvent name. Stamps the local
 * invalidation time so the Ably echo of the same mutation can de-dupe its
 * refetch (see {@link receivingFeedsRecentlyInvalidatedLocally}).
 */
export function invalidateReceivingFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  for (const queryKey of RECEIVING_FEED_ROOTS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** Unbox "Unboxed" rail segment (`ReceivingFeedRail` feed `unboxRecent`). */
export const UNBOX_RAIL_SEGMENT = 'received' as const;

/**
 * Testing "You / Recent" rail segment (`TestingRecentRail` query key[2]).
 * Line-keyed (not carton) — use {@link patchTestingRailByLine}, not carton merge.
 */
export const TESTING_RAIL_SEGMENT = 'tested' as const;

/**
 * Unbox "Queue" — triage door-scanned matched POs waiting to unbox. The ONLY
 * feed that mirrors triage found-PO scans into Unbox mode.
 */
export const UNBOX_QUEUE_SEGMENT = 'unbox-queue' as const;

/** Unbox-surface rails only — excludes Queue (triage bridge). */
const UNBOX_SURFACE_SEGMENTS = new Set([UNBOX_RAIL_SEGMENT, 'viewed']);

/** Triage sidebar rail segments — never refresh from an Unbox-surface scan. */
export const TRIAGE_RAIL_SEGMENTS = new Set(['scanned', 'triage-combined', 'unfound']);

type ReceivingIntakeSurface = 'triage' | 'unbox';

export interface ReceivingRailRow {
  id: number;
  receiving_id?: number | null;
  client_event_id?: string;
  /** First Unbox-open stamp — stable; preserved across hydration merges. */
  unbox_opened_at?: string | null;
}

/** Scoped target for `receiving-lines-prepended` — prevents cross-mode rail bleed. */
interface ReceivingLinesPrependedDetail {
  segments: string[];
  /** When set, only rails whose query key carries this scope accept the prepend. */
  scope?: string;
  intakeSurface: ReceivingIntakeSurface;
  rows: ReceivingRailRow[];
}

function isReceivingLinesTableKey(key: readonly unknown[]): boolean {
  return Array.isArray(key) && key[0] === 'receiving-lines-table';
}

function isUnboxReceivingQueryKey(key: readonly unknown[]): boolean {
  if (!isReceivingLinesTableKey(key)) return false;
  if (key[1] === 'rail') {
    return typeof key[2] === 'string' && UNBOX_SURFACE_SEGMENTS.has(key[2]);
  }
  // History table (`view=activity`) — unfound cartons scanned in Unbox belong here.
  return key[1] === 'activity' && key[2] === 'history';
}

function isUnboxQueueQueryKey(key: readonly unknown[]): boolean {
  return (
    isReceivingLinesTableKey(key)
    && key[1] === 'rail'
    && key[2] === UNBOX_QUEUE_SEGMENT
  );
}

function isTriageReceivingQueryKey(key: readonly unknown[]): boolean {
  if (!isReceivingLinesTableKey(key)) return false;
  if (key[1] === 'rail') {
    return typeof key[2] === 'string' && TRIAGE_RAIL_SEGMENTS.has(key[2]);
  }
  return false;
}

/** Parse legacy (bare row[]) and scoped prepend payloads. */
export function parseReceivingPrependedDetail(raw: unknown): {
  rows: ReceivingRailRow[];
  segments: string[] | null;
  scope: string | null;
  intakeSurface: ReceivingIntakeSurface | null;
} {
  if (Array.isArray(raw)) {
    return { rows: raw as ReceivingRailRow[], segments: null, scope: null, intakeSurface: null };
  }
  if (!raw || typeof raw !== 'object') {
    return { rows: [], segments: null, scope: null, intakeSurface: null };
  }
  const d = raw as Partial<ReceivingLinesPrependedDetail>;
  const rows = Array.isArray(d.rows) ? (d.rows as ReceivingRailRow[]) : [];
  const segments = Array.isArray(d.segments) ? d.segments.map(String) : null;
  const scope = typeof d.scope === 'string' ? d.scope : null;
  const intakeSurface = d.intakeSurface === 'unbox' || d.intakeSurface === 'triage' ? d.intakeSurface : null;
  return { rows, segments, scope, intakeSurface };
}

/** True when a rail's query key should accept a scoped prepend event. */
export function receivingPrependMatchesRail(
  queryKey: readonly unknown[],
  segments: string[] | null,
  scope: string | null,
): boolean {
  if (!segments || segments.length === 0) return false;
  if (!isReceivingLinesTableKey(queryKey) || queryKey[1] !== 'rail') return false;
  const seg = String(queryKey[2] ?? '');
  if (!segments.includes(seg)) return false;
  if (scope != null && String(queryKey[3] ?? 'default') !== scope) return false;
  return true;
}

export function dispatchReceivingLinesPrepended(detail: ReceivingLinesPrependedDetail): void {
  if (detail.rows.length === 0) return;
  window.dispatchEvent(new CustomEvent('receiving-lines-prepended', { detail }));
}

/** Triage-only refresh — Unbox rails must not listen. */
export function dispatchReceivingTriageRefresh(): void {
  window.dispatchEvent(new CustomEvent('receiving-triage-refresh'));
}

/**
 * Invalidate Unbox-surface rails + History — use after Unbox-surface scans.
 * Does NOT touch the Unbox Queue (triage found-PO bridge).
 */
function invalidateUnboxReceivingFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  void queryClient.invalidateQueries({
    predicate: (q) => isUnboxReceivingQueryKey(q.queryKey),
  });
}

/** Invalidate only the Unbox Queue (triage found-PO bridge). */
function invalidateUnboxQueueFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  void queryClient.invalidateQueries({
    predicate: (q) => isUnboxQueueQueryKey(q.queryKey),
  });
}

/**
 * After a triage found-PO scan: refresh triage rails AND the Unbox Queue mirror.
 * This is the only deliberate cross-mode invalidation.
 */
function invalidateTriageAndUnboxQueueFeeds(queryClient: QueryClient): void {
  invalidateTriageReceivingFeeds(queryClient);
  invalidateUnboxQueueFeeds(queryClient);
}

/** Invalidate triage rails + the triage unfound queue cache root. */
function invalidateTriageReceivingFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  void queryClient.invalidateQueries({
    predicate: (q) => isTriageReceivingQueryKey(q.queryKey),
  });
  void queryClient.invalidateQueries({ queryKey: ['receiving'] });
}

export function deferInvalidateTriageReceivingFeeds(queryClient: QueryClient): void {
  const run = () => invalidateTriageReceivingFeeds(queryClient);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    setTimeout(run, 16);
  }
}

export function deferInvalidateTriageAndUnboxQueueFeeds(queryClient: QueryClient): void {
  const run = () => invalidateTriageAndUnboxQueueFeeds(queryClient);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    setTimeout(run, 16);
  }
}

/** TanStack key for carton sibling metadata (sku/price/condition/qty — no serials). */
export function receivingSiblingsQueryKey(receivingId: number) {
  return ['receiving-siblings', receivingId] as const;
}

/**
 * TanStack key for the parallel serials-hydration fetch (`include=serials`).
 * Its result is overlaid onto {@link receivingSiblingsQueryKey}'s cache — that
 * remains the single `row.serials` SoT every consumer (accordion rows, the
 * optimistic scan path in `useLineSerials`) reads. Splitting the fetch lets the
 * sibling metadata paint instantly while the heavier serial resolution streams
 * in behind a per-row skeleton, instead of gating the whole row on it.
 */
export function receivingSiblingsSerialsQueryKey(receivingId: number) {
  return ['receiving-siblings-serials', receivingId] as const;
}

/** The `{ success, receiving_lines }` envelope stored under {@link receivingSiblingsQueryKey}. */
export interface ReceivingSiblingsCache<L extends { id: number } = { id: number }> {
  success: boolean;
  receiving_lines: L[];
}

/**
 * Pure upsert of one line into a siblings-cache envelope — INSERT when the id is
 * absent (appended, preserving API order), else a shallow field merge onto the
 * existing row. Returns a fresh envelope so React Query notifies; a caller that
 * needs referential no-op semantics can compare `.receiving_lines`.
 *
 * This is the cache-patch primitive behind the unified unfound surface (plan
 * Phase 2): a return import creates a NEW line, which `usePoLinesData`'s
 * `receiving-line-updated` handler can't surface (it only maps over rows that
 * already exist). Upserting into {@link receivingSiblingsQueryKey} makes the new
 * line reflow in the active-row accordion instantly, before the reconciling
 * refetch lands. Pure + DB-free so it is unit-testable.
 */
export function upsertSiblingLine<L extends { id: number }>(
  prev: ReceivingSiblingsCache<L> | undefined,
  line: L,
): ReceivingSiblingsCache<L> {
  const base = prev?.receiving_lines ?? [];
  const idx = base.findIndex((r) => r.id === line.id);
  if (idx === -1) {
    return { success: prev?.success ?? true, receiving_lines: [...base, line] };
  }
  const next = base.slice();
  next[idx] = { ...next[idx], ...line };
  return { success: prev?.success ?? true, receiving_lines: next };
}

/**
 * Write one line into the shared {@link receivingSiblingsQueryKey} cache via
 * {@link upsertSiblingLine} — the client wrapper used by the unified unfound
 * surface's return-import path so the just-created line lands on the accordion's
 * own SoT cache (not just a window event). No-op for a non-materialized carton.
 */
export function writeReceivingSiblingLine<L extends { id: number }>(
  queryClient: QueryClient,
  receivingId: number,
  line: L,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  queryClient.setQueryData<ReceivingSiblingsCache<L>>(
    receivingSiblingsQueryKey(receivingId),
    (prev) => upsertSiblingLine(prev, line),
  );
}

/**
 * Dual-write serials onto the siblings cache + `receiving-line-updated` bus —
 * the shared choke point for matched (`useLineSerials`) and unfound
 * (`useActiveUnfoundLineSerials`) optimistic serial CRUD. Maps an existing row;
 * does not insert (use {@link writeReceivingSiblingLine} for new lines).
 *
 * Optional `units` patches materialised `receiving_line_unit` rows in the same
 * write — used by by-id `include=serials` refresh so the multi-qty green check
 * keeps durable unit ids. Omit `units` on serial-only optimistic CRUD so a
 * scan confirm never blanks a previously hydrated units list.
 */
export function publishLineSerials(
  queryClient: QueryClient,
  receivingId: number | null | undefined,
  lineId: number,
  serials: unknown[],
  units?: unknown[] | null,
): void {
  const unitsPatch = units !== undefined ? { units } : {};
  if (receivingId != null && Number.isFinite(receivingId) && receivingId > 0) {
    queryClient.setQueryData<ReceivingSiblingsCache>(
      receivingSiblingsQueryKey(receivingId),
      (prev) =>
        prev?.receiving_lines
          ? {
              ...prev,
              receiving_lines: prev.receiving_lines.map((r) =>
                r.id === lineId ? { ...r, serials, ...unitsPatch } : r,
              ),
            }
          : prev,
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('receiving-line-updated', {
        detail: { id: lineId, serials, ...unitsPatch },
      }),
    );
  }
}

/**
 * Remap a temp (negative) line id → real server line id inside the siblings
 * cache, preserving optimistic serials when the real row does not yet carry them.
 */
export function remapReceivingSiblingLineId<L extends { id: number; serials?: unknown }>(
  queryClient: QueryClient,
  receivingId: number,
  tempLineId: number,
  realLine: L,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  queryClient.setQueryData<ReceivingSiblingsCache<L>>(
    receivingSiblingsQueryKey(receivingId),
    (prev) => {
      const base = prev?.receiving_lines ?? [];
      const temp = base.find((r) => r.id === tempLineId);
      const withoutTemp = base.filter((r) => r.id !== tempLineId);
      const merged: L = {
        ...realLine,
        serials:
          Array.isArray(realLine.serials) && (realLine.serials as unknown[]).length > 0
            ? realLine.serials
            : (temp?.serials ?? realLine.serials),
      };
      return upsertSiblingLine({ success: prev?.success ?? true, receiving_lines: withoutTemp }, merged);
    },
  );
}

/**
 * Drop a temp optimistic line from the siblings cache (total create failure).
 */
export function removeReceivingSiblingLine(
  queryClient: QueryClient,
  receivingId: number,
  lineId: number,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  queryClient.setQueryData<ReceivingSiblingsCache>(
    receivingSiblingsQueryKey(receivingId),
    (prev) =>
      prev?.receiving_lines
        ? {
            ...prev,
            receiving_lines: prev.receiving_lines.filter((r) => r.id !== lineId),
          }
        : prev,
  );
}

/**
 * Seed the siblings cache from a lookup-po / optimistic stub response so
 * PoLinesAccordion and the workspace paint immediately before the hydration
 * fetch (with serials) lands.
 */
export function seedReceivingSiblingsCache(
  queryClient: QueryClient,
  receivingId: number,
  lines: unknown[],
  receivingPackage?: unknown,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0 || lines.length === 0) return;
  queryClient.setQueryData(receivingSiblingsQueryKey(receivingId), {
    success: true,
    receiving_lines: lines,
    ...(receivingPackage != null ? { receiving_package: receivingPackage } : {}),
  });
}

/**
 * Defer a full feed invalidation until after the workspace has painted — keeps
 * scan resolve from stampeding every rail with concurrent refetches during the
 * critical open path. Falls back to `setTimeout` when `requestIdleCallback` is
 * unavailable (SSR/tests).
 */
export function deferInvalidateReceivingFeeds(queryClient: QueryClient): void {
  const run = () => invalidateReceivingFeeds(queryClient);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    setTimeout(run, 16);
  }
}

/** Stable React list key for one carton across stub → server reconcile. */
export function receivingRailCartonKey(receivingId: number): string {
  return `carton:${receivingId}`;
}

/**
 * Durable AnimatePresence / React list key for a receiving rail row.
 * Prefer an explicit `client_event_id`, then `carton:{receiving_id}`, then line id.
 * Never key carton-deduped feeds on line id alone — stub→real swaps would remount.
 */
export function receivingRailReconcileId(row: {
  client_event_id?: string | null;
  receiving_id?: number | null;
  id: number;
}): string | number {
  if (typeof row.client_event_id === 'string' && row.client_event_id.length > 0) {
    return row.client_event_id;
  }
  const rid = row.receiving_id;
  if (rid != null && Number.isFinite(rid)) return receivingRailCartonKey(rid);
  return row.id;
}

function normalizeRailRows(rows: ReceivingRailRow[]): ReceivingRailRow[] {
  return rows.map((row) => {
    const rid = row.receiving_id;
    const cartonKey =
      row.client_event_id
      ?? (rid != null && Number.isFinite(rid) ? receivingRailCartonKey(rid) : undefined);
    return cartonKey ? { ...row, client_event_id: cartonKey } : row;
  });
}

/**
 * Identity-only keep-alive patches (`{ id, receiving_id, client_event_id }`) from
 * the workspace must MERGE onto an existing Unboxed row — never PREPEND. A
 * prepend onto an empty/partial cache paints `Line #N` + `/ ?` and leaks
 * Incoming/workspace chrome into the Unbox dock (mode separation).
 *
 * Rail cache rows are typed narrowly but often carry full line display fields;
 * read those via a soft cast (same pattern as title/qty patches).
 */
function isIdentityOnlyRailRow(row: ReceivingRailRow): boolean {
  const r = row as ReceivingRailRow & {
    item_name?: string | null;
    sku?: string | null;
    catalog_product_title?: string | null;
    zoho_item_title?: string | null;
    zoho_purchaseorder_number?: string | null;
    zoho_purchaseorder_id?: string | null;
    quantity_received?: number | null;
  };
  return (
    r.quantity_received == null
    && !(r.item_name || r.sku || r.catalog_product_title || r.zoho_item_title)
    && !(r.zoho_purchaseorder_number || r.zoho_purchaseorder_id)
  );
}

function mergeRailRows(
  old: ReceivingRailRow[] | undefined,
  normalized: ReceivingRailRow[],
): ReceivingRailRow[] | undefined {
  if (!Array.isArray(old)) return old;
  let next = [...old];
  for (const row of normalized) {
    const rid = row.receiving_id;
    const key = row.client_event_id;
    const idx = next.findIndex(
      (r) =>
        (rid != null && r.receiving_id === rid)
        || (key != null && r.client_event_id === key),
    );
    if (idx >= 0) {
      const merged = { ...next[idx], ...row, client_event_id: key ?? next[idx].client_event_id };
      // First-open stamp is stable — never let a re-scan / hydration overwrite
      // with a newer (or null) unbox_opened_at and reshuffle the Unboxed rail.
      if (next[idx].unbox_opened_at != null) {
        merged.unbox_opened_at = next[idx].unbox_opened_at;
      }
      next[idx] = merged;
    } else if (isIdentityOnlyRailRow(row)) {
      // Workspace identity keep-alive with no matching carton — do not invent
      // a Line # stub. Membership comes from scan-apply / view=unbox_opened.
      continue;
    } else {
      // New carton only — prepend so a first Unbox scan lands at the top until
      // the authoritative refetch settles (same first-open stamp).
      next = [row, ...next];
    }
  }
  return next;
}

function upsertRailSegmentRows(
  queryClient: QueryClient,
  segment: string,
  rows: ReceivingRailRow[],
): void {
  if (rows.length === 0) return;
  const normalized = normalizeRailRows(rows);
  queryClient.setQueriesData<ReceivingRailRow[]>(
    { queryKey: ['receiving-lines-table', 'rail', segment] },
    (old) => mergeRailRows(old, normalized),
  );
}

/** Upsert into the Unbox "Unboxed" rail only (`segment=received`). */
export function upsertReceivingRailRows(
  queryClient: QueryClient,
  rows: ReceivingRailRow[],
): void {
  upsertRailSegmentRows(queryClient, UNBOX_RAIL_SEGMENT, rows);
}

/**
 * Title-only rename on the Unboxed dock, keyed by carton.
 *
 * Unboxed does not subscribe to `receiving-line-updated` — return-serial /
 * product-title upgrades must call this instead of dumping rich bus patches.
 * Allowlisted fields are exactly what `receivingProductTitle` / adaptive-po
 * read. Age (`unbox_opened_at`), qty, status, serials are never written.
 */
type UnboxRailTitlePatch = {
  item_name?: string | null;
  catalog_product_title?: string | null;
  zoho_item_title?: string | null;
  sku?: string | null;
  zoho_purchaseorder_number?: string | null;
};

export function patchUnboxRailTitleByCarton(
  queryClient: QueryClient,
  receivingId: number,
  title: UnboxRailTitlePatch,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  const cartonKey = receivingRailCartonKey(receivingId);
  let existingId: number | null = null;
  for (const [, rows] of queryClient.getQueriesData<ReceivingRailRow[]>({
    queryKey: ['receiving-lines-table', 'rail', UNBOX_RAIL_SEGMENT],
  })) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find(
      (r) => r.receiving_id === receivingId || r.client_event_id === cartonKey,
    );
    if (hit) {
      existingId = hit.id;
      break;
    }
  }
  const patch: ReceivingRailRow & UnboxRailTitlePatch = {
    id: existingId ?? -receivingId,
    receiving_id: receivingId,
    client_event_id: cartonKey,
  };
  if ('item_name' in title) patch.item_name = title.item_name;
  if ('catalog_product_title' in title) patch.catalog_product_title = title.catalog_product_title;
  if ('zoho_item_title' in title) patch.zoho_item_title = title.zoho_item_title;
  if ('sku' in title) patch.sku = title.sku;
  if ('zoho_purchaseorder_number' in title) {
    patch.zoho_purchaseorder_number = title.zoho_purchaseorder_number;
  }
  upsertReceivingRailRows(queryClient, [patch]);
}

/**
 * Qty / workflow-only patch on the Unboxed dock, keyed by carton.
 *
 * Unboxed ignores `receiving-line-updated` — mark-received must call this for
 * instant dock qty/status instead of a full-row bus dump. Age
 * (`unbox_opened_at`), titles, and serials are never written.
 */
type UnboxRailQtyPatch = {
  quantity_received?: number;
  quantity_expected?: number | null;
  workflow_status?: string | null;
};

export function patchUnboxRailQtyByCarton(
  queryClient: QueryClient,
  receivingId: number,
  qty: UnboxRailQtyPatch,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  const cartonKey = receivingRailCartonKey(receivingId);
  let existingId: number | null = null;
  for (const [, rows] of queryClient.getQueriesData<ReceivingRailRow[]>({
    queryKey: ['receiving-lines-table', 'rail', UNBOX_RAIL_SEGMENT],
  })) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find(
      (r) => r.receiving_id === receivingId || r.client_event_id === cartonKey,
    );
    if (hit) {
      existingId = hit.id;
      break;
    }
  }
  const patch: ReceivingRailRow & UnboxRailQtyPatch = {
    id: existingId ?? -receivingId,
    receiving_id: receivingId,
    client_event_id: cartonKey,
  };
  if ('quantity_received' in qty) patch.quantity_received = qty.quantity_received;
  if ('quantity_expected' in qty) patch.quantity_expected = qty.quantity_expected;
  if ('workflow_status' in qty) patch.workflow_status = qty.workflow_status;
  upsertReceivingRailRows(queryClient, [patch]);
}

/**
 * Set/clear the filed-claim rail flag (`zendesk_ticket`) on every receiving
 * sidebar rail, keyed by carton.
 *
 * Unboxed ignores `receiving-line-updated` (`acceptLineUpdateBus: false`), so a
 * claim unlink that only dispatches the bus leaves the orange Ticket chip on
 * Unfound PO rows. This patches all `receiving-lines-table/rail/*` caches so
 * the flag drops immediately; pair with {@link invalidateReceivingFeeds} for
 * the authoritative refetch.
 */
export function patchReceivingRailTicketByCarton(
  queryClient: QueryClient,
  receivingId: number,
  zendeskTicket: string | null,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  const cartonKey = receivingRailCartonKey(receivingId);
  queryClient.setQueriesData<Array<ReceivingRailRow & { zendesk_ticket?: string | null }>>(
    { queryKey: ['receiving-lines-table', 'rail'] },
    (old) => {
      if (!Array.isArray(old)) return old;
      let changed = false;
      const next = old.map((row) => {
        if (row.receiving_id !== receivingId && row.client_event_id !== cartonKey) {
          return row;
        }
        const prev = (row.zendesk_ticket ?? '').trim() || null;
        const nextTicket = zendeskTicket?.trim() || null;
        if (prev === nextTicket) return row;
        changed = true;
        return { ...row, zendesk_ticket: nextTicket };
      });
      return changed ? next : old;
    },
  );
}

/**
 * Allowlisted fields on the Testing "You / Recent" dock, keyed by **line** id.
 *
 * TestingRecentRail does not subscribe to `receiving-line-updated`. Verdict /
 * qty upgrades must call this instead of dumping a by-id GET row onto the bus.
 * Age (`tested_at` / `last_activity_at`) and serials are never written —
 * membership reconciles via `testing-result-recorded` refresh.
 */
type TestingRailPatch = {
  workflow_status?: string | null;
  qa_status?: string | null;
  disposition_code?: string | null;
  tested_count?: number | null;
  quantity_received?: number;
  quantity_expected?: number | null;
  item_name?: string | null;
  sku?: string | null;
};

export function patchTestingRailByLine(
  queryClient: QueryClient,
  lineId: number,
  fields: TestingRailPatch,
): void {
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  queryClient.setQueriesData<Array<ReceivingRailRow & TestingRailPatch>>(
    { queryKey: ['receiving-lines-table', 'rail', TESTING_RAIL_SEGMENT] },
    (old) => {
      if (!Array.isArray(old)) return old;
      const idx = old.findIndex((r) => r.id === lineId);
      if (idx < 0) return old;
      const next = [...old];
      const merged: ReceivingRailRow & TestingRailPatch = { ...next[idx], id: lineId };
      if ('workflow_status' in fields) merged.workflow_status = fields.workflow_status;
      if ('qa_status' in fields) merged.qa_status = fields.qa_status;
      if ('disposition_code' in fields) merged.disposition_code = fields.disposition_code;
      if ('tested_count' in fields) merged.tested_count = fields.tested_count;
      if ('quantity_received' in fields) merged.quantity_received = fields.quantity_received;
      if ('quantity_expected' in fields) merged.quantity_expected = fields.quantity_expected;
      if ('item_name' in fields) merged.item_name = fields.item_name;
      if ('sku' in fields) merged.sku = fields.sku;
      next[idx] = merged;
      return next;
    },
  );
}

/**
 * Drop a pre-resolve `scan:{tracking}` pending stub from the Unboxed rail so
 * the final `carton:{id}` upsert does not double-list.
 */
export function removePendingScanRailRow(
  queryClient: QueryClient,
  clientEventId: string,
): void {
  if (!clientEventId) return;
  filterRailSegmentRows(
    queryClient,
    UNBOX_RAIL_SEGMENT,
    (r) => r.client_event_id !== clientEventId,
  );
}

/**
 * Mirror triage found-PO scans into the Unbox Queue — the only cross-mode write.
 */
export function upsertUnboxQueueRows(
  queryClient: QueryClient,
  rows: ReceivingRailRow[],
): void {
  upsertRailSegmentRows(queryClient, UNBOX_QUEUE_SEGMENT, rows);
}

function filterRailSegmentRows(
  queryClient: QueryClient,
  segment: string,
  keep: (row: ReceivingRailRow) => boolean,
): void {
  queryClient.setQueriesData<ReceivingRailRow[]>(
    { queryKey: ['receiving-lines-table', 'rail', segment] },
    (old) => {
      if (!Array.isArray(old)) return old;
      const next = old.filter(keep);
      return next.length === old.length ? old : next;
    },
  );
}

/**
 * After a scan OPENS a carton on the Unbox surface: surgically drop that carton
 * from every triage rail cache (Prioritize / combined / Unfound) and mark the
 * triage feeds stale.
 *
 * Server membership already excludes unbox-opened cartons (`view=scanned`'s
 * NOT-unbox-opened arm + unfound-queue `exclude_unbox_intake`), but the triage
 * rails are `staleTime: 20_000` caches with no cross-surface signal — a soft
 * return to Arrival kept painting the carton as phantom dock inventory until a
 * stale refetch. Surgical remove fixes the very next paint; the light
 * invalidate makes inactive triage queries refetch on their next mount (and
 * stamps the local-invalidation window so a near-simultaneous Ably echo does
 * not double-refetch). Unbox rails are never touched here.
 */
export function purgeTriageRailsAfterUnboxOpen(
  queryClient: QueryClient,
  receivingId: number,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  for (const segment of TRIAGE_RAIL_SEGMENTS) {
    filterRailSegmentRows(queryClient, segment, (r) => r.receiving_id !== receivingId);
  }
  invalidateTriageReceivingFeeds(queryClient);
}

/**
 * Drop a carton from Unbox rail caches (Unboxed + Queue) by `receiving_id`.
 * Pair with `receiving-entry-deleted` so the list exits one keyed row instead of
 * waiting for a refetch that might resurrect it.
 */
export function removeReceivingRailByCarton(
  queryClient: QueryClient,
  receivingId: number,
): void {
  if (!Number.isFinite(receivingId)) return;
  const keep = (r: ReceivingRailRow) => r.receiving_id !== receivingId;
  filterRailSegmentRows(queryClient, UNBOX_RAIL_SEGMENT, keep);
  filterRailSegmentRows(queryClient, UNBOX_QUEUE_SEGMENT, keep);
}

/**
 * Drop a line-shaped rail row; when the cached row has a `receiving_id`, remove
 * the whole carton (Unbox is one-row-per-carton).
 */
export function removeReceivingRailByLine(
  queryClient: QueryClient,
  lineId: number,
): void {
  if (!Number.isFinite(lineId)) return;
  let receivingId: number | null = null;
  for (const [, rows] of queryClient.getQueriesData<ReceivingRailRow[]>({
    queryKey: ['receiving-lines-table', 'rail'],
  })) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find((r) => r.id === lineId);
    if (hit?.receiving_id != null && Number.isFinite(hit.receiving_id)) {
      receivingId = hit.receiving_id;
      break;
    }
  }
  if (receivingId != null) {
    removeReceivingRailByCarton(queryClient, receivingId);
    return;
  }
  filterRailSegmentRows(queryClient, UNBOX_RAIL_SEGMENT, (r) => r.id !== lineId);
}

/**
 * After deleting a line inside an Unbox carton: keep the same `carton:{id}` row
 * (in-place update), either as an unfound stub or retargeted at a remaining line.
 * Prevents line-delete → carton exit+enter flicker on the Unboxed rail.
 */
export function reconcileUnboxRailAfterLineDelete(
  queryClient: QueryClient,
  receivingId: number,
  next:
    | { kind: 'stub'; tracking: string }
    | { kind: 'line'; lineId: number },
): void {
  if (!Number.isFinite(receivingId)) return;
  const cartonKey = receivingRailCartonKey(receivingId);
  if (next.kind === 'stub') {
    // Dynamic import avoided — stub builder lives next to sidebar shared shapes.
    // Callers that already built a stub should prefer upsertReceivingRailRows;
    // this path stamps the negative id + carton key onto the existing cache row.
    queryClient.setQueriesData<ReceivingRailRow[]>(
      { queryKey: ['receiving-lines-table', 'rail', UNBOX_RAIL_SEGMENT] },
      (old) => {
        if (!Array.isArray(old)) return old;
        let found = false;
        const mapped = old.map((r) => {
          if (r.receiving_id !== receivingId) return r;
          found = true;
          const prev = r as ReceivingRailRow & { tracking_number?: string | null };
          return {
            ...r,
            id: -receivingId,
            client_event_id: cartonKey,
            item_name: 'Unfound PO',
            quantity_received: 0,
            receiving_source: 'unmatched' as const,
            tracking_number: next.tracking || prev.tracking_number || null,
          };
        });
        if (found) return mapped;
        return [
          {
            id: -receivingId,
            receiving_id: receivingId,
            client_event_id: cartonKey,
          } as ReceivingRailRow,
          ...mapped,
        ];
      },
    );
    return;
  }
  queryClient.setQueriesData<ReceivingRailRow[]>(
    { queryKey: ['receiving-lines-table', 'rail', UNBOX_RAIL_SEGMENT] },
    (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((r) =>
        r.receiving_id === receivingId
          ? { ...r, id: next.lineId, client_event_id: cartonKey }
          : r,
      );
    },
  );
}

/**
 * Query-key roots whose cached payloads carry receiving-line rows with a
 * `photo_count` field (the camera ×N badge). Used by the optimistic bump below
 * so the badge moves the instant an upload commits — before the reconciling
 * refetch lands. Kept narrow (only feeds that actually hold rows) so we don't
 * walk unrelated caches.
 */
const RECEIVING_PHOTO_COUNT_ROOTS: ReadonlyArray<ReadonlyArray<string>> = [
  ['receiving-lines-table'],
  ['receiving-lines'],
  ['receiving-lines-with-serials'],
];

interface PhotoCountRow {
  receiving_id?: number | null;
  photo_count?: number | null;
}

/**
 * Adjust `photo_count` on every row matching `receivingId` inside one cached
 * payload, returning a new reference only when something changed (so React
 * Query skips a no-op notify). Handles both feed shapes: a plain `row[]`
 * (mobile feeds) and the `{ receiving_lines: row[] }` envelope (desktop rails).
 */
function adjustRowsPhotoCount<T>(data: T, receivingId: number, delta: number): T {
  const bumpRow = (row: PhotoCountRow): PhotoCountRow => {
    if (!row || typeof row !== 'object') return row;
    if (Number(row.receiving_id) !== receivingId) return row;
    const next = Math.max(0, (Number(row.photo_count) || 0) + delta);
    return next === (Number(row.photo_count) || 0) ? row : { ...row, photo_count: next };
  };
  const bumpList = (list: PhotoCountRow[]): PhotoCountRow[] => {
    let changed = false;
    const next = list.map((r) => {
      const b = bumpRow(r);
      if (b !== r) changed = true;
      return b;
    });
    return changed ? next : list;
  };

  if (Array.isArray(data)) {
    const next = bumpList(data as PhotoCountRow[]);
    return (next === data ? data : next) as T;
  }
  if (data && typeof data === 'object') {
    const envelope = data as { receiving_lines?: PhotoCountRow[] };
    if (Array.isArray(envelope.receiving_lines)) {
      const next = bumpList(envelope.receiving_lines);
      return (next === envelope.receiving_lines ? data : { ...data, receiving_lines: next }) as T;
    }
  }
  return data;
}

/**
 * Optimistically move the camera ×N badge for a carton across every cached
 * receiving feed, without waiting for the network refetch. Pair with
 * {@link invalidateReceivingFeeds} (which {@link notifyReceivingPhotoChanged}
 * already calls) so the optimistic value reconciles against the server count.
 */
function bumpReceivingPhotoCount(
  queryClient: QueryClient,
  receivingId: number,
  delta: number,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0 || !delta) return;
  for (const queryKey of RECEIVING_PHOTO_COUNT_ROOTS) {
    queryClient.setQueriesData<unknown>({ queryKey }, (data: unknown) =>
      data == null ? data : adjustRowsPhotoCount(data, receivingId, delta),
    );
  }
}

/** TanStack key for `/api/receiving-photos?receivingId=…`. */
export function receivingPhotosQueryKey(receivingId: number) {
  return ['receiving-photos', receivingId] as const;
}

interface ReceivingPhotosCacheRow {
  id: number;
  photoUrl?: string;
}

/**
 * Optimistically drop a deleted photo from the per-carton cache, then invalidate
 * so rails/mobile `photo_count` badges (camera ×N) and the gallery reconcile.
 */
export function refreshReceivingPhotos(
  queryClient: QueryClient,
  receivingId: number,
  deletedPhotoId?: number,
): void {
  const queryKey = receivingPhotosQueryKey(receivingId);
  if (deletedPhotoId != null) {
    queryClient.setQueryData<{ photos?: ReceivingPhotosCacheRow[] }>(queryKey, (old) => {
      if (!old?.photos) return old;
      const photos = old.photos.filter((p) => p.id !== deletedPhotoId);
      return photos.length === old.photos.length ? old : { ...old, photos };
    });
  }
  void queryClient.invalidateQueries({ queryKey });
  invalidateReceivingFeeds(queryClient);
}

/**
 * Single client-side entry point for photo CRUD side-effects: broadcast the
 * window/feed refresh signal (same-tab + mobile list) and patch/invalidate the
 * per-carton photo cache when `receivingId` is known.
 */
export function notifyReceivingPhotoChanged(
  queryClient: QueryClient,
  payload: ReceivingPhotoChangedPayload,
): void {
  dispatchReceivingPhotoChanged(payload);
  const receivingId = payload.receivingId;
  if (receivingId == null || !Number.isFinite(receivingId) || receivingId <= 0) return;

  // Optimistically move the camera ×N badge before the refetch round-trip, so a
  // capture on this device updates the feed the moment the upload commits. The
  // invalidate inside refreshReceivingPhotos() reconciles against the server
  // count. 'update' touches no photo, so it carries no delta.
  const photoDelta = payload.photoIds?.length ?? 1;
  if (payload.action === 'delete') {
    bumpReceivingPhotoCount(queryClient, receivingId, -photoDelta);
  } else if (payload.action === 'insert' || payload.action === 'upload') {
    bumpReceivingPhotoCount(queryClient, receivingId, photoDelta);
  }

  const deletedId =
    payload.action === 'delete' && payload.photoIds?.length === 1
      ? payload.photoIds[0]
      : undefined;
  refreshReceivingPhotos(queryClient, receivingId, deletedId);
}

// ─── Receiving-lines table query (shared workbench SoT) ──────────────────────

/** Envelope of GET /api/receiving-lines paginated list (see ApiResponse twin in receiving-lines-table-helpers). */
export interface ReceivingLinesListResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch tiers for the lines table:
 *  - `full`  — authoritative rows incl. the reconciled `include=serials` resolve.
 *  - `spine` — fast-paint tier (`?phase=spine`): same rows, serial chips served
 *    from the cheap `serial_projection` read-model instead of the expensive
 *    authoritative resolve. Painted first, then upgraded by `full`.
 */
type ReceivingLinesFetchPhase = 'full' | 'spine';

/**
 * Spine paint window. The list SELECT's per-row laterals (photo_count, catalog
 * title lookups, similarity()) scale with LIMIT, so the paint tier clamps deep
 * windows (500 → 150 measured ~-0.5s server time on view=activity) and lets the
 * `full` pass restore the authoritative depth right behind it. 150 comfortably
 * covers the History tab's current-week slice (~100 rows on a busy week).
 */
const SPINE_PAINT_LIMIT = 150;

/**
 * The ONE query-options builder for the receiving/unbox lines table. Every
 * consumer of the table's rows (the table itself via useReceivingLinesQuery,
 * the Unbox KPI strip, prefetchers) MUST build its options here so they share
 * a single cache entry per (mode, context, phase) — a second page-local fetch
 * of the same view is the duplicate-fetch bug this factory exists to prevent.
 *
 * The `full` phase key is exactly `mode.queryKey(ctx)` (unchanged), so all
 * existing `['receiving-lines-table']`-root invalidation keeps covering it;
 * the `spine` key appends a `'spine'` leaf under the same root.
 */
export function receivingLinesTableQuery(
  mode: ReceivingModeDescriptor,
  ctx: ReceivingModeContext,
  phase: ReceivingLinesFetchPhase = 'full',
) {
  const params = mode.buildParams(ctx);
  if (phase === 'spine') {
    params.delete('include');
    params.set('phase', 'spine');
    const limit = Number(params.get('limit'));
    if (Number.isFinite(limit) && limit > SPINE_PAINT_LIMIT) {
      params.set('limit', String(SPINE_PAINT_LIMIT));
    }
  }
  const queryKey =
    phase === 'spine'
      ? ([...mode.queryKey(ctx), 'spine'] as const)
      : mode.queryKey(ctx);
  return {
    queryKey,
    queryFn: async (): Promise<ReceivingLinesListResponse> => {
      const res = await fetch(`/api/receiving-lines?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      return res.json();
    },
    staleTime: 20_000,
  };
}
