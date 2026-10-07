'use client';

import type { QueryClient } from '@tanstack/react-query';
import {
  dispatchReceivingPhotoChanged,
  type ReceivingPhotoChangedPayload,
} from '@/utils/events';
import {
  reconcileListParams,
  reconcileListQueryKey,
  type ReceivingModeContext,
  type ReceivingModeDescriptor,
} from '@/lib/receiving/receiving-modes';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  isReceivingRailShipmentKey,
  receivingRailCartonKey,
  receivingRailRowKey,
  receivingRailShipmentKey,
} from '@/lib/receiving/rail/rail-carton-key';

// Re-exported for this module's existing client importers (useTrackingScan,
// scan-apply, …); the definition moved to a server-safe module so the RSC rail
// seed can share it. See `@/lib/receiving/rail/rail-carton-key`.
export { receivingRailCartonKey, receivingRailRowKey, receivingRailShipmentKey };

/** Query-key roots for every receiving feed (Phase 1 of the receiving-triage streamline — see docs/receiving-triage-streamline-plan.md §3.1). */
const RECEIVING_FEED_ROOTS: ReadonlyArray<ReadonlyArray<string>> = [
  ['receiving-lines-table'],
  ['receiving'],
  ['incoming-delivered-unscanned'],
  // Inbound's sidebar delivery-state counts (`incoming.pipeline`).
  ['nav-facets'],
  // Inventory Displays / Incoming details dossier — receive · unreceive · notes
  // must refresh the trust trail without a manual F5.
  ['incoming-details'],
];

// Wall-clock of the last LOCAL receiving-feed invalidation (a scan/receive on THIS client).
let lastLocalReceivingInvalidationAt = 0;

/**
 * Cartons this client re-scanned while they already sat on the Unboxed rail,
 * with when. Their `receiving-log.changed` echo carries nothing the rail lacks
 * — the scan changed no row — so the realtime handler skips its feed refetch.
 */
const localRescanAt = new Map<number, number>();
/** The echo publishes after the scan route's deferred work settles (~1–3 s). */
const LOCAL_RESCAN_ECHO_MS = 10_000;

/**
 * True when {@link invalidateReceivingFeeds} ran locally within `withinMs`, or
 * the echo is for a carton this client just re-scanned in place. The realtime
 * invalidation handler consults this to suppress the redundant echo-driven
 * refetch of the desktop rails right after a local scan.
 */
export function receivingFeedsRecentlyInvalidatedLocally(
  echoReceivingId?: number | null,
  withinMs = 800,
): boolean {
  const now = Date.now();
  if (now - lastLocalReceivingInvalidationAt < withinMs) return true;
  if (echoReceivingId == null) return false;
  const at = localRescanAt.get(echoReceivingId);
  return at != null && now - at < LOCAL_RESCAN_ECHO_MS;
}

/** Stamp a local re-scan of a carton already on the rail (see {@link receivingFeedsRecentlyInvalidatedLocally}). */
export function noteLocalReceivingRescan(receivingId: number): void {
  const now = Date.now();
  lastLocalReceivingInvalidationAt = now;
  for (const [id, at] of localRescanAt) {
    if (now - at >= LOCAL_RESCAN_ECHO_MS) localRescanAt.delete(id);
  }
  localRescanAt.set(receivingId, now);
}

/** Invalidate every receiving feed so all rails + tiles refetch atomically. */
export function invalidateReceivingFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  for (const queryKey of RECEIVING_FEED_ROOTS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** Unbox "Unboxed" rail segment (`ReceivingFeedRail` feed `unboxRecent`). */
export const UNBOX_RAIL_SEGMENT = 'received' as const;

/**
 * Testing "You / Recent" rail segment (`testingRecent` / TestingRecentRail query key[2]).
 * Line-keyed (not carton) — use {@link patchTestingRailByLine}, not carton merge.
 */
export const TESTING_RAIL_SEGMENT = 'tested' as const;

/** The Arrival rail's segment (`triageCombined`) — never refreshed from an Unbox-surface scan. */
export const TRIAGE_RAIL_SEGMENT = 'triage-combined' as const;

type ReceivingIntakeSurface = 'triage' | 'unbox';

export interface ReceivingRailRow {
  id: number;
  receiving_id?: number | null;
  client_event_id?: string;
  /** First Unbox-open stamp — stable; preserved across hydration merges. */
  unbox_opened_at?: string | null;
}

/** `receiving-lines-prepended` — the station LINES TABLE's optimistic prepend (rails write their cache directly). */
interface ReceivingLinesPrependedDetail {
  intakeSurface: ReceivingIntakeSurface;
  rows: ReceivingRailRow[];
}

/** Parse a `receiving-lines-prepended` payload. */
export function parseReceivingPrependedDetail(raw: unknown): {
  rows: ReceivingRailRow[];
  intakeSurface: ReceivingIntakeSurface | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { rows: [], intakeSurface: null };
  }
  const d = raw as Partial<ReceivingLinesPrependedDetail>;
  const rows = Array.isArray(d.rows) ? (d.rows as ReceivingRailRow[]) : [];
  const intakeSurface = d.intakeSurface === 'unbox' || d.intakeSurface === 'triage' ? d.intakeSurface : null;
  return { rows, intakeSurface };
}

export function dispatchReceivingLinesPrepended(detail: ReceivingLinesPrependedDetail): void {
  if (detail.rows.length === 0) return;
  window.dispatchEvent(new CustomEvent('receiving-lines-prepended', { detail }));
}

/** Invalidate the Arrival rail + the triage unfound queue cache root. */
function invalidateTriageReceivingFeeds(queryClient: QueryClient): void {
  lastLocalReceivingInvalidationAt = Date.now();
  void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table', 'rail', TRIAGE_RAIL_SEGMENT] });
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

/** TanStack key for carton sibling metadata (sku/price/condition/qty — no serials). */
export function receivingSiblingsQueryKey(receivingId: number) {
  return ['receiving-siblings', receivingId] as const;
}

/** TanStack key for the parallel serials-hydration fetch (`include=serials`). */
export function receivingSiblingsSerialsQueryKey(receivingId: number) {
  return ['receiving-siblings-serials', receivingId] as const;
}

/** The `include=serials` carton envelope stored under {@link receivingSiblingsSerialsQueryKey}. */
export interface ReceivingSiblingsSerialsData {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  receiving_package?: unknown;
}

/**
 * The ONE `include=serials` carton read. The scan's open, the line pane and
 * the rail peek share this cache entry, so a carton's serials load once.
 */
export function receivingSiblingsSerialsQuery(receivingId: number) {
  return {
    queryKey: receivingSiblingsSerialsQueryKey(receivingId),
    queryFn: async (): Promise<ReceivingSiblingsSerialsData> => {
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`);
      if (!res.ok) throw new Error('Failed to fetch serials');
      return res.json();
    },
    staleTime: 15_000,
  };
}

/** The `{ success, receiving_lines }` envelope stored under {@link receivingSiblingsQueryKey}. */
export interface ReceivingSiblingsCache<L extends { id: number } = { id: number }> {
  success: boolean;
  receiving_lines: L[];
}

/** Pure upsert of one line into a siblings-cache envelope — INSERT when the id is absent (appended, preserving API order), else a shallow… */
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

/** Write one line into the shared {@link receivingSiblingsQueryKey} cache via {@link upsertSiblingLine} — the client wrapper used by the… */
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

/** Dual-write serials onto the siblings cache + `receiving-line-updated` bus — the shared choke point for matched (`useLineSerials`) and… */
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

/** Defer a full feed invalidation until after the workspace has painted — keeps scan resolve from stampeding every rail with concurrent… */
export function deferInvalidateReceivingFeeds(queryClient: QueryClient): void {
  const run = () => invalidateReceivingFeeds(queryClient);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    setTimeout(run, 16);
  }
}

/** Durable AnimatePresence / React list key for a receiving rail row. */
export function receivingRailReconcileId(row: {
  client_event_id?: string | null;
  tracking_number?: string | null;
  receiving_id?: number | null;
  id: number;
}): string | number {
  if (typeof row.client_event_id === 'string' && row.client_event_id.length > 0) {
    return row.client_event_id;
  }
  return receivingRailRowKey(row);
}

function normalizeRailRows(rows: ReceivingRailRow[]): ReceivingRailRow[] {
  return rows.map((row) => {
    if (row.client_event_id) return row;
    // Only a SHIPMENT or CARTON key is durable enough to stamp. The ladder's
    // line-id fallback is a render key, never a reconcile key — stamping it
    // would let an unrelated row match on it in `mergeRailRows`.
    const key = receivingRailRowKey(row);
    return typeof key === 'string' ? { ...row, client_event_id: key } : row;
  });
}

/** Identity-only keep-alive patches (`{ id, receiving_id, client_event_id }`) from the workspace must MERGE onto an existing Unboxed row —… */
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
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts):
  return (
    r.quantity_received == null
    && !(r.catalog_product_title || r.zoho_item_title || r.item_name || r.sku)
    && !(r.zoho_purchaseorder_number || r.zoho_purchaseorder_id)
  );
}

/**
 * How a write meets the rail cache:
 * - `upsert` — merge onto the matching carton in place, else prepend (a first open).
 * - `patch`  — merge onto the matching carton in place; never add a row.
 * - `insert` — add only rows the rail does not already hold; never touch one it does.
 */
type RailMergeMode = 'upsert' | 'patch' | 'insert';

function mergeRailRows(
  old: ReceivingRailRow[] | undefined,
  normalized: ReceivingRailRow[],
  mode: RailMergeMode,
): ReceivingRailRow[] | undefined {
  if (!Array.isArray(old)) return old;
  let next = [...old];
  for (const row of normalized) {
    const rid = row.receiving_id;
    const key = row.client_event_id;
    const idx = next.findIndex(
      (r) =>
        (rid != null && r.receiving_id === rid)
        || (key != null && r.client_event_id === key)
        || (mode === 'insert' && r.id === row.id),
    );
    if (idx >= 0) {
      if (mode === 'insert') continue;
      // A pending scan row never lands on a real carton row — it would null
      // the carton's identity and repaint it as a fresh scan.
      if (rid == null && next[idx].receiving_id != null) continue;
      // Key preference:
      const existingKey = next[idx].client_event_id;
      const nextKey =
        isReceivingRailShipmentKey(existingKey) && !isReceivingRailShipmentKey(key)
          ? existingKey
          : (key ?? existingKey);
      const merged = { ...next[idx], ...row, client_event_id: nextKey };
      // First-open stamp is stable — never let a re-scan / hydration overwrite
      // with a newer (or null) unbox_opened_at and reshuffle the Unboxed rail.
      if (next[idx].unbox_opened_at != null) {
        merged.unbox_opened_at = next[idx].unbox_opened_at;
      }
      next[idx] = merged;
    } else if (mode === 'patch' || isIdentityOnlyRailRow(row)) {
      // Workspace identity keep-alive with no matching carton — do not invent
      // a Line # stub. Membership comes from scan-apply / view=unbox_opened.
      continue;
    } else {
      // New carton only — prepend so a first scan lands at the top until the
      // authoritative refetch settles (same first-open stamp).
      next = [row, ...next];
    }
  }
  return next;
}

function upsertRailSegmentRows(
  queryClient: QueryClient,
  segment: string,
  rows: ReceivingRailRow[],
  mode: RailMergeMode,
): void {
  if (rows.length === 0) return;
  const normalized = normalizeRailRows(rows);
  queryClient.setQueriesData<ReceivingRailRow[]>(
    { queryKey: ['receiving-lines-table', 'rail', segment] },
    (old) => mergeRailRows(old, normalized, mode),
  );
}

/** Write into the Unbox "Unboxed" rail only (`segment=received`); default `upsert`. */
export function upsertReceivingRailRows(
  queryClient: QueryClient,
  rows: ReceivingRailRow[],
  mode: Exclude<RailMergeMode, 'insert'> = 'upsert',
): void {
  upsertRailSegmentRows(queryClient, UNBOX_RAIL_SEGMENT, rows, mode);
}

/** Add scanned cartons the Arrival rail does not already list; a listed one is left exactly as it is. */
export function insertArrivalRailRows(queryClient: QueryClient, rows: ReceivingRailRow[]): void {
  upsertRailSegmentRows(queryClient, TRIAGE_RAIL_SEGMENT, rows, 'insert');
}

/** True when the Unboxed rail cache already lists this carton. */
export function unboxRailHasCarton(queryClient: QueryClient, receivingId: number): boolean {
  return queryClient
    .getQueriesData<ReceivingRailRow[]>({ queryKey: ['receiving-lines-table', 'rail', UNBOX_RAIL_SEGMENT] })
    .some(([, rows]) => Array.isArray(rows) && rows.some((r) => r.receiving_id === receivingId));
}

/** Title-only rename on the Unboxed dock, keyed by carton. */
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

/** Qty / workflow-only patch on the Unboxed dock, keyed by carton. */
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

/** Set/clear the filed-claim rail flag (`zendesk_ticket`) on every receiving sidebar rail, keyed by carton. */
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

/** Allowlisted fields on the Testing "You / Recent" dock, keyed by **line** id. */
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
 * Drop a scan's pre-resolve pending row (no carton yet) from the Unboxed rail.
 * Only a carton-less row can match — a real carton row is never removed here.
 */
export function removePendingScanRailRow(
  queryClient: QueryClient,
  clientEventId: string | null,
): void {
  if (!clientEventId) return;
  filterRailSegmentRows(
    queryClient,
    UNBOX_RAIL_SEGMENT,
    (r) => r.receiving_id != null || r.client_event_id !== clientEventId,
  );
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

/** After a scan OPENS a carton on the Unbox surface: */
export function purgeTriageRailsAfterUnboxOpen(
  queryClient: QueryClient,
  receivingId: number,
): void {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;
  filterRailSegmentRows(queryClient, TRIAGE_RAIL_SEGMENT, (r) => r.receiving_id !== receivingId);
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
}

type CartonRailSnapshot = {
  entries: Array<{ queryKey: readonly unknown[]; rows: ReceivingRailRow[] }>;
};

/** Capture rail rows for a carton before optimistic hide (undo restore). */
export function snapshotReceivingRailByCarton(
  queryClient: QueryClient,
  receivingId: number,
): CartonRailSnapshot {
  const entries: CartonRailSnapshot['entries'] = [];
  if (!Number.isFinite(receivingId)) return { entries };
  for (const [queryKey, data] of queryClient.getQueriesData<ReceivingRailRow[]>({
    queryKey: ['receiving-lines-table', 'rail'],
  })) {
    if (!Array.isArray(data)) continue;
    const rows = data.filter((r) => r.receiving_id === receivingId);
    if (rows.length > 0) entries.push({ queryKey, rows });
  }
  return { entries };
}

/** Put snapshotted carton rows back onto the rails they came from. */
export function restoreReceivingRailSnapshot(
  queryClient: QueryClient,
  snapshot: CartonRailSnapshot,
): void {
  for (const { queryKey, rows } of snapshot.entries) {
    if (rows.length === 0) continue;
    queryClient.setQueryData<ReceivingRailRow[]>(queryKey, (old) => {
      if (!Array.isArray(old)) return rows;
      const ids = new Set(rows.map((r) => r.id));
      return [...rows, ...old.filter((r) => !ids.has(r.id))];
    });
  }
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

/** Query-key roots whose cached payloads carry receiving-line rows with a `photo_count` field (the camera ×N badge). */
const RECEIVING_PHOTO_COUNT_ROOTS: ReadonlyArray<ReadonlyArray<string>> = [
  ['receiving-lines-table'],
  ['receiving-lines'],
  ['receiving-lines-with-serials'],
];

interface PhotoCountRow {
  receiving_id?: number | null;
  photo_count?: number | null;
}

/** Adjust `photo_count` on every row matching `receivingId` inside one cached payload, returning a new reference only when something… */
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

/** Optimistically move the camera ×N badge for a carton across every cached receiving feed, without waiting for the network refetch. */
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

/**
 * Receiving photo reads are push-backed: `receiving-photo.changed` on the
 * station channel invalidates `['receiving-photos']` (`useRealtimeInvalidation`
 * + `useReceivingPhotosRealtimeRefresh`), phone uploads arrive on the phone
 * bridge, and every local write runs `refreshReceivingPhotos`. The old 10–20s
 * overrides bought nothing but a refetch of every open carton's photo lists on
 * each window refocus (7 requests per alt-tab on `/unbox`, measured 2026-09-28).
 */
export const RECEIVING_PHOTOS_STALE_MS = 3 * 60_000;

/** The filter a `/api/receiving-photos` list read sends. */
export interface ReceivingPhotoListParams {
  receivingId: number;
  photoIntent: string;
  receivingLineId?: number | null;
  photoAspect?: string | null;
}

/**
 * ONE key per `/api/receiving-photos?photoIntent=…` URL. The Unbox carton's
 * photo surfaces each spelled their own key for the same URL (`…, 'compare'`,
 * `…, 'carton', 'any'`, bare intent), so `?photoIntent=carton` fired twice per
 * load. Stays under `receivingPhotosQueryKey(id)` so per-carton invalidation
 * still reaches it.
 */
export function receivingPhotoListQueryKey(p: ReceivingPhotoListParams) {
  return [
    ...receivingPhotosQueryKey(p.receivingId),
    p.photoIntent,
    p.receivingLineId ?? 'carton',
    p.photoAspect ?? 'any',
  ] as const;
}

/** The raw list payload for {@link receivingPhotoListQueryKey}. */
export async function fetchReceivingPhotoList<T>(p: ReceivingPhotoListParams): Promise<T> {
  const params = new URLSearchParams({
    receivingId: String(p.receivingId),
    photoIntent: p.photoIntent,
  });
  if (p.receivingLineId != null) params.set('receivingLineId', String(p.receivingLineId));
  if (p.photoAspect) params.set('photoAspect', p.photoAspect);
  const res = await fetch(`/api/receiving-photos?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
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

  // Optimistically move the camera ×N badge before the refetch round-trip, so a capture on this device updates the feed the moment the…
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

/** Fetch tiers for the lines table: */
type ReceivingLinesFetchPhase = 'full' | 'spine';

/** Spine paint window. */
const SPINE_PAINT_LIMIT = 150;

/** Bound the lines fetch so a slow/hung `/api/receiving-lines` can never pin the skeleton forever (the `/incoming` "feels broken" symptom). */
const RECEIVING_LINES_FETCH_TIMEOUT_MS = 15_000;

/** The ONE query-options builder for the receiving/unbox lines table. */
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
    queryFn: () => fetchReceivingLinesList(params),
    staleTime: 20_000,
  };
}

async function fetchReceivingLinesList(params: URLSearchParams): Promise<ReceivingLinesListResponse> {
  const res = await fetch(`/api/receiving-lines?${params.toString()}`, {
    signal: AbortSignal.timeout(RECEIVING_LINES_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

/**
 * A pasted Inbound list's rows — the SAME key and request the Incoming table
 * makes for `?ref_in=` (`incomingMode`), so the Check's warehouse fallback and
 * the ledger share one fetch.
 */
export function receivingReconcileRowsQuery(refIn: readonly string[]) {
  const params = reconcileListParams(refIn);
  return {
    queryKey: reconcileListQueryKey(refIn),
    queryFn: () => fetchReceivingLinesList(params),
    staleTime: 20_000,
  };
}
