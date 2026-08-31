/**
 * `/api/orders/queue-counts` → the client cache shape, in ONE place.
 *
 * Two paths write the same TanStack key (`['dashboard-table','unshipped-counts',…]`):
 * the browser fetch (`fetchUnshippedQueueCounts`) and the RSC dehydrate seed
 * (`seedUnshippedQueue`). They MUST produce the same shape — a seed that drops a
 * field the client reads wins on first paint and then holds for the query's
 * whole `staleTime`, so the surface renders a wrong-but-settled answer with no
 * error anywhere.
 *
 * That is not hypothetical: the seed narrowed the payload to
 * total/byStage/urgent/combos and silently dropped `packPlacement`, so To-ship's
 * "At stations" tile (and the per-bench chips) read 0 benches for the first 60s
 * on every load of `/shipping/orders`.
 *
 * Dependency-free on purpose — a server module and a browser module both import
 * it (`build-gotchas.md` → bundle altitude).
 */

/** Raw signal combo from the queue-counts endpoint — mapped to a fulfillment
 *  lane CLIENT-side via `deriveFulfillmentState` (Decision 8), never in SQL. */
export interface QueueCountsCombo {
  hasTechScan: boolean;
  blocked: boolean;
  count: number;
}

export interface QueueCountsPackPlacement {
  counts: Array<{
    locationId: number;
    locationName: string;
    locationBarcode: string | null;
    locationKind: 'DESK' | 'STAGING';
    count: number;
  }>;
  totalPlaced: number;
}

export interface UnshippedQueueCounts {
  total: number;
  byStage: { all: number; pending: number; tested: number; packed?: number };
  /** Operator-flagged urgent tally (orders.is_urgent) for the "Urgent" segment. */
  urgent: number;
  /** Ship-by today or past (PST) — Must-ship facet. */
  mustShip?: number;
  /**
   * Rows the PACK station stamped today (civil PST) — the To-ship today strip's
   * handoff to the Shipped desk. Same feed the Shipped desk lists, so the
   * number and the page it links to agree.
   */
  shippedToday?: number;
  combos: QueueCountsCombo[];
  /** Packing DESK/STAGING open-package counts (Ready-to-Pack placement). */
  packPlacement?: QueueCountsPackPlacement;
}

export const ZERO_QUEUE_COUNTS: UnshippedQueueCounts = {
  total: 0,
  byStage: { all: 0, pending: 0, tested: 0, packed: 0 },
  urgent: 0,
  mustShip: 0,
  shippedToday: 0,
  combos: [],
  packPlacement: { counts: [], totalPlaced: 0 },
};

/**
 * Normalize a raw queue-counts response. Returns `null` when the payload is not
 * a usable answer, so each caller decides its own fallback — the browser path
 * serves zeros, the seed leaves the key unset and lets the client fetch.
 */
export function normalizeQueueCountsPayload(raw: unknown): UnshippedQueueCounts | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.total !== 'number') return null;

  const rawPack = data.packPlacement;
  const packPlacement =
    rawPack && typeof rawPack === 'object'
      ? {
          counts: Array.isArray((rawPack as { counts?: unknown }).counts)
            ? ((rawPack as { counts: QueueCountsPackPlacement['counts'] }).counts)
            : [],
          totalPlaced:
            typeof (rawPack as { totalPlaced?: unknown }).totalPlaced === 'number'
              ? (rawPack as { totalPlaced: number }).totalPlaced
              : 0,
        }
      : ZERO_QUEUE_COUNTS.packPlacement;

  return {
    total: data.total,
    byStage:
      (data.byStage as UnshippedQueueCounts['byStage']) ?? ZERO_QUEUE_COUNTS.byStage,
    urgent: typeof data.urgent === 'number' ? data.urgent : 0,
    mustShip: typeof data.mustShip === 'number' ? data.mustShip : 0,
    shippedToday: typeof data.shippedToday === 'number' ? data.shippedToday : 0,
    combos: Array.isArray(data.combos) ? (data.combos as QueueCountsCombo[]) : [],
    packPlacement,
  };
}
