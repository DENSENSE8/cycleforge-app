/** Local pickup order status → presentation (dot · label · chip). */

/** True when the order has left Draft (`COMPLETED`). */
export function pickupOrderIsDone(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'COMPLETED';
}

/**
 * Draft with intake lines that still need station evidence / finalize —
 * `receiving_id` not yet linked. Empty shells are Draft, not Need to process.
 */
export function pickupOrderNeedsProcess(args: {
  status: string | null | undefined;
  receivingId?: number | null;
  itemCount?: number;
}): boolean {
  if (pickupOrderIsDone(args.status)) return false;
  if (String(args.status || '').toUpperCase() === 'VOIDED') return false;
  if (args.receivingId != null) return false;
  if (args.itemCount != null && args.itemCount < 1) return false;
  return true;
}

/** Tailwind fill for the 8px status dot (rail + Product cell). */
export function pickupOrderStatusDot(
  status: string | null | undefined,
  opts?: { receivingId?: number | null; needsProcess?: boolean },
): string {
  if (pickupOrderIsDone(status)) return 'bg-emerald-500';
  if (opts?.needsProcess ?? (opts?.receivingId == null && !pickupOrderIsDone(status))) {
    return 'bg-amber-400';
  }
  return 'bg-amber-400';
}

/** Operator-facing coarse label — Done / Need to process / Draft. */
export function pickupOrderStatusLabel(
  status: string | null | undefined,
  opts?: { receivingId?: number | null; needsProcess?: boolean },
): string {
  if (pickupOrderIsDone(status)) return 'Done';
  const needs =
    opts?.needsProcess ??
    pickupOrderNeedsProcess({ status, receivingId: opts?.receivingId, itemCount: 1 });
  return needs ? 'Need to process' : 'Draft';
}

/**
 * Inset chip classes for the Status column (ring + fill). Matches the prior
 * page-local chip so the visual stays; only the map moves here.
 */
export function pickupOrderStatusChipClass(
  status: string | null | undefined,
  opts?: { receivingId?: number | null; needsProcess?: boolean },
): string {
  if (pickupOrderIsDone(status)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  const needs =
    opts?.needsProcess ??
    pickupOrderNeedsProcess({ status, receivingId: opts?.receivingId, itemCount: 1 });
  // Need to process keeps the amber Draft tone; label carries the queue noun.
  if (needs) {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

/** Workbench status-tab ids for `/pickup` (`?status=`). */
export const PICKUP_STATUS_TABS = ['all', 'process', 'draft', 'done'] as const;
export type PickupStatusTab = (typeof PICKUP_STATUS_TABS)[number];

export function parsePickupStatusTab(raw: string | null | undefined): PickupStatusTab {
  const v = String(raw || '').toLowerCase();
  if (v === 'process' || v === 'draft' || v === 'done') return v;
  return 'all';
}

/**
 * Wire tokens `?status=` may carry on `/pickup` (route-param hygiene).
 * Do not round-trip {@link parsePickupStatusTab} — it always coerces to `all`.
 */
export function parsePickupStatusTabWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (PICKUP_STATUS_TABS as readonly string[]).includes(v) ? v : null;
}
