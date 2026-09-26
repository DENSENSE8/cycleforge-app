import type { QueryClient } from '@tanstack/react-query';
import { toOrderRecord } from '@/lib/orders/order-record-normalize';

/** Dashboard-order cache surgery — one place for the incremental patches that keep the Unshipped queue live WITHOUT a full `/api/orders`… */

const UNSHIPPED_LIST_KEY = ['dashboard-table', 'unshipped'] as const;
const UNSHIPPED_COUNTS_KEY = ['dashboard-table', 'unshipped-counts'] as const;
const DESK_COUNTS_KEY = ['dashboard-table', 'desk-counts'] as const;

type OrderRow = { id?: number | string } & Record<string, unknown>;

/**
 * Merge a partial patch into the matching order row across every cached unshipped
 * list variant. No-op when the row isn't cached. Use for in-place field updates
 * (assignment, tech verdict, tracking) that keep the row in the queue.
 */
export function patchUnshippedOrderCache(
  queryClient: QueryClient,
  orderId: number,
  patch: Partial<OrderRow>,
): void {
  if (!Number.isFinite(orderId)) return;
  queryClient.setQueriesData({ queryKey: UNSHIPPED_LIST_KEY }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    let changed = false;
    const next = current.map((row: OrderRow) => {
      if (Number(row?.id) !== orderId) return row;
      // Matching the id is not the same as changing the row.
      const rowChanged = Object.keys(patch).some(
        (key) => row[key] !== (patch as Record<string, unknown>)[key],
      );
      if (!rowChanged) return row;
      changed = true;
      return { ...row, ...patch };
    });
    return changed ? next : current;
  });
}

/** The tech-verdict patch — one shape for the ONE event that flips an order out of the pending lane (`order.tested`, published by… */
export function patchUnshippedOrderTested(
  queryClient: QueryClient,
  event: {
    orderId: unknown;
    testedBy?: unknown;
    packLocationId?: unknown;
    packLocationName?: unknown;
  },
): boolean {
  const orderId = Number(event?.orderId);
  if (!Number.isFinite(orderId)) return false;

  const testedByRaw = event?.testedBy == null ? null : Number(event.testedBy);
  const testedBy = testedByRaw != null && Number.isFinite(testedByRaw) ? testedByRaw : null;

  const patch: Partial<OrderRow> = { has_tech_scan: true };
  if (testedBy != null) patch.tested_by = testedBy;

  // The bench, when the scan was made at an armed one.
  const packLocationId = Number(event?.packLocationName != null ? event.packLocationId : NaN);
  if (Number.isFinite(packLocationId)) {
    patch.pack_location_id = packLocationId;
    patch.pack_location_name = String(event.packLocationName);
  }

  patchUnshippedOrderCache(queryClient, orderId, patch);
  invalidateUnshippedCounts(queryClient);
  return true;
}

/**
 * Drop an order from every cached unshipped list variant — it has left the queue
 * (packed / dock-scanned / shipped / canceled). Confirm-then-commit semantics are
 * the caller's job; this is the cache half only.
 */
export function removeUnshippedOrderFromCache(queryClient: QueryClient, orderId: number): void {
  if (!Number.isFinite(orderId)) return;
  queryClient.setQueriesData({ queryKey: UNSHIPPED_LIST_KEY }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    const next = current.filter((row: OrderRow) => Number(row?.id) !== orderId);
    return next.length === current.length ? current : next;
  });
}

/** Refresh the lightweight Unshipped counts (sidebar legend + stage dropdown + nav badge) and the desk-sidebar view badges (`desk-counts`)… */
export function invalidateUnshippedCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: UNSHIPPED_COUNTS_KEY });
  queryClient.invalidateQueries({ queryKey: DESK_COUNTS_KEY });
}

/**
 * Insert a newly created order onto every cached unshipped list (Pending).
 * Patch helpers only UPDATE rows already in cache — add-order stayed invisible
 * until staleTime expired and `/api/orders` could still HIT Upstash.
 */
export function insertUnshippedOrderIntoCache(
  queryClient: QueryClient,
  row: OrderRow,
): void {
  const orderId = Number(row?.id);
  if (!Number.isFinite(orderId) || orderId <= 0) return;
  const normalized = toOrderRecord(row) as unknown as OrderRow;
  queryClient.setQueriesData({ queryKey: UNSHIPPED_LIST_KEY }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    const without = current.filter((existing: OrderRow) => Number(existing?.id) !== orderId);
    return [normalized, ...without];
  });
}
