import type { QueryClient } from '@tanstack/react-query';

/**
 * Dashboard-order cache surgery — one place for the incremental patches that keep
 * the Unshipped queue live WITHOUT a full `/api/orders` refetch (Phase 3 of the
 * unshipped-dashboard-performance plan).
 *
 * All three helpers operate over the `['dashboard-table','unshipped', …]` PREFIX,
 * so a single call updates EVERY cached list variant (every stage / limit / staff
 * key) at once. They are array-safe — a non-array cache entry (e.g. an in-flight
 * placeholder) passes through untouched — and identity-preserving: an entry that
 * didn't actually change is returned by reference so React Query skips the
 * re-render. The lightweight counts query lives under a SEPARATE key
 * (`unshipped-counts`) and is refreshed via {@link invalidateUnshippedCounts};
 * the list-prefix helpers never touch it.
 */

const UNSHIPPED_LIST_KEY = ['dashboard-table', 'unshipped'] as const;
const UNSHIPPED_COUNTS_KEY = ['dashboard-table', 'unshipped-counts'] as const;

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
      // Matching the id is not the same as changing the row. This used to set
      // `changed` on the id match alone, which contradicted the identity
      // promise in the header above: every redundant patch (two subscribers on
      // one event, an Ably echo of a scan this tab already applied) handed
      // React Query a fresh array and re-rendered the whole queue for nothing.
      // With the live-change chip pulse downstream, "re-render for nothing" is
      // no longer free — it is one keystroke away from flashing a status that
      // did not move.
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

/**
 * The tech-verdict patch — one shape for the ONE event that flips an order out
 * of the pending lane (`order.tested`, published by `/api/tech/scan` when a
 * tracking number is scanned at the bench).
 *
 * It lives here rather than in a component because more than one surface reads
 * the unshipped cache and only one of them used to subscribe: `UnshippedTable`
 * owned this patch inline, so the drill host (`OrdersDrillHost`) — which queries
 * the same cache without mounting that table — went stale on a scan until
 * something else invalidated it. (The compare panes were a second such reader
 * until they were deleted on 2026-08-21; one consumer is still one too many for
 * a patch to hide inside a table.)
 *
 * Never clobbers an existing `tested_by` with a null: the event carries the
 * tester only when the scan resolved one.
 */
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

  // The bench, when the scan was made at an armed one. `publishOrderTested` has
  // always carried `packLocationId` / `packLocationName`; the patch dropped
  // them, so the Station chip on every board kept showing an em dash until some
  // unrelated event forced a refetch. Same event, same round trip — the data
  // was already on the wire.
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

/**
 * Refresh the lightweight Unshipped counts (sidebar legend + stage dropdown + nav
 * badge) — a cheap `COUNT(*)`, no row payload. Call this alongside any patch/remove
 * so the tallies stay in step without downloading rows.
 */
export function invalidateUnshippedCounts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: UNSHIPPED_COUNTS_KEY });
}
