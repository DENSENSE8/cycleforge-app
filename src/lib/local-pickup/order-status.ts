/**
 * Local pickup order status → presentation (dot · label · chip).
 *
 * LCPU orders are Draft or Done (`COMPLETED`) — not receiving workflow stages.
 * Rail dots, grid Product dots, and the Status column chip all read from here
 * so they cannot drift. Pure + DB-free for client bundles.
 */

/** True when the order has left Draft (`COMPLETED`). */
export function pickupOrderIsDone(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'COMPLETED';
}

/** Tailwind fill for the 8px status dot (rail + Product cell). */
export function pickupOrderStatusDot(status: string | null | undefined): string {
  return pickupOrderIsDone(status) ? 'bg-emerald-500' : 'bg-amber-400';
}

/** Operator-facing coarse label — Done / Draft. */
export function pickupOrderStatusLabel(status: string | null | undefined): string {
  return pickupOrderIsDone(status) ? 'Done' : 'Draft';
}

/**
 * Inset chip classes for the Status column (ring + fill). Matches the prior
 * page-local chip so the visual stays; only the map moves here.
 */
export function pickupOrderStatusChipClass(status: string | null | undefined): string {
  return pickupOrderIsDone(status)
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : 'bg-amber-50 text-amber-700 ring-amber-200';
}
