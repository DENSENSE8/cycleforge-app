/**
 * `['order-timeline', orderId]` — ONE key, ONE fetcher, ONE payload shape.
 *
 * Three surfaces read this route: `OrderTimelineSection` (the Activity trail),
 * `OrderReturnsCard`, and `useSearchOrderPhotos` (the `/search` Displays photo
 * spine). They shared the KEY already, which is correct — it is one fetch of
 * one route — but each declared its own `queryFn`, and React Query keeps the
 * fetcher of whichever consumer mounted first.
 *
 * That made the cache entry's SHAPE a race. `useSearchOrderPhotos` parsed the
 * payload down to `{ unitPhotos }` and threw the other six fields away; on
 * `/search` it mounts first (the Displays index row needs the photo count to
 * render its subtitle), so `OrderTimelineSection` and `OrderReturnsCard` then
 * read a cache entry with no `events`, no `lifecycle`, no `rmaEvents` — a blank
 * Activity trail and a Returns card that never appears, with no error anywhere.
 *
 * Its own docblock had even written the rule down ("a narrower parse under the
 * same key would make whichever consumer mounted first decide what the other
 * two see") while the code below it did exactly that. A shared constant is what
 * makes the rule hold instead of merely being stated: there is now one parse,
 * and a consumer narrows with `select`, which is per-observer and cannot touch
 * what anyone else reads.
 */

import type {
  OrderAuditRow,
  InventoryTimelineRow,
  StationActivityRow,
  ThreadMessageTimelineRow,
  CarrierEvent,
  RmaTimelineRow,
  UnitTimelinePhotoRow,
} from '@/lib/timeline';

/** Completed picking_sessions rows for FIND pick hops. */
export interface OrderPickSessionRow {
  id: number;
  ended_at: string | null;
  actor_name: string | null;
}

export interface OrderTimelinePayload {
  events: OrderAuditRow[];
  lifecycle: InventoryTimelineRow[];
  stationEvents: StationActivityRow[];
  threadMessages: ThreadMessageTimelineRow[];
  carrierEvents: CarrierEvent[];
  rmaEvents: RmaTimelineRow[];
  unitPhotos: UnitTimelinePhotoRow[];
  pickSessions: OrderPickSessionRow[];
  /** PACK-station SAL — FIND only. Workplace timeline still uses audit PACK_COMPLETED. */
  packEvents: StationActivityRow[];
}

/** The one key. `OrderDocumentsSection` invalidates this exact shape. */
export function orderTimelineQueryKey(orderId: number) {
  return ['order-timeline', orderId] as const;
}

/**
 * The one fetcher. Parses the FULL route payload — never a subset, however
 * little the calling surface needs. Narrow with `select`, not here.
 */
export async function fetchOrderTimeline(orderId: number): Promise<OrderTimelinePayload> {
  const res = await fetch(`/api/orders/${orderId}/timeline`);
  if (!res.ok) throw new Error('Failed to fetch order timeline');
  const json = await res.json();
  return {
    events: (json.events ?? []) as OrderAuditRow[],
    lifecycle: (json.lifecycle ?? []) as InventoryTimelineRow[],
    stationEvents: (json.stationEvents ?? []) as StationActivityRow[],
    threadMessages: (json.threadMessages ?? []) as ThreadMessageTimelineRow[],
    carrierEvents: (json.carrierEvents ?? []) as CarrierEvent[],
    rmaEvents: (json.rmaEvents ?? []) as RmaTimelineRow[],
    unitPhotos: (json.unitPhotos ?? []) as UnitTimelinePhotoRow[],
    pickSessions: (json.pickSessions ?? []) as OrderPickSessionRow[],
    packEvents: (json.packEvents ?? []) as StationActivityRow[],
  };
}

/**
 * Spread into `useQuery`. Every consumer of this route uses it, so the entry
 * holds the same shape no matter which one mounted first.
 */
export function orderTimelineQuery(orderId: number) {
  return {
    queryKey: orderTimelineQueryKey(orderId),
    queryFn: () => fetchOrderTimeline(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  };
}
