/** `['order-timeline', orderId]` — ONE key, ONE fetcher, ONE payload shape. */

import type {
  OrderAuditRow,
  InventoryTimelineRow,
  StationActivityRow,
  ThreadMessageTimelineRow,
  CarrierEvent,
  RmaTimelineRow,
  UnitTimelinePhotoRow,
} from '@/lib/timeline';
import type { OrderPoLink } from '@/lib/orders/po-order-link';

/** Completed picking_sessions rows for FIND pick hops. */
export interface OrderPickSessionRow {
  id: number;
  ended_at: string | null;
  actor_name: string | null;
}

/**
 * One `order_notes` row. Kept structurally local, same discipline as
 * `ThreadMessageTimelineRow`: this client module never imports a server-only
 * domain module.
 */
export interface OrderNoteTimelineRow {
  id: string | number;
  noteText: string | null;
  createdAt: string | null;
  authorName?: string | null;
}

/** One `entity_signals` row — the diagnostic "why", not a status. */
export interface EntitySignalTimelineRow {
  id: string | number;
  signalKind: string | null;
  reasonCode: string | null;
  /** `smallint` in Postgres — a rank, not a word. Never render it bare. */
  severity: number | null;
  notes: string | null;
  occurredAt: string | null;
}

export interface OrderTimelinePayload {
  events: OrderAuditRow[];
  lifecycle: InventoryTimelineRow[];
  stationEvents: StationActivityRow[];
  threadMessages: ThreadMessageTimelineRow[];
  /** `order_notes` TABLE — not the single `orders.notes` column. */
  orderNotes: OrderNoteTimelineRow[];
  /** `entity_signals` — the "why" behind a hold, a failure, a return. */
  signals: EntitySignalTimelineRow[];
  carrierEvents: CarrierEvent[];
  rmaEvents: RmaTimelineRow[];
  unitPhotos: UnitTimelinePhotoRow[];
  pickSessions: OrderPickSessionRow[];
  /** PACK-station SAL — FIND only. Workplace timeline still uses audit PACK_COMPLETED. */
  packEvents: StationActivityRow[];
  /** Purchase orders bought for this order (`receiving_order_link`), each with its carton. */
  poLinks?: OrderPoLink[];
}

/** The one key. `OrderDocumentsSection` invalidates this exact shape. */
function orderTimelineQueryKey(orderId: number) {
  return ['order-timeline', orderId] as const;
}

/**
 * The one fetcher. Parses the FULL route payload — never a subset, however
 * little the calling surface needs. Narrow with `select`, not here.
 */
async function fetchOrderTimeline(orderId: number): Promise<OrderTimelinePayload> {
  const res = await fetch(`/api/orders/${orderId}/timeline`);
  if (!res.ok) throw new Error('Failed to fetch order timeline');
  const json = await res.json();
  return {
    events: (json.events ?? []) as OrderAuditRow[],
    lifecycle: (json.lifecycle ?? []) as InventoryTimelineRow[],
    stationEvents: (json.stationEvents ?? []) as StationActivityRow[],
    threadMessages: (json.threadMessages ?? []) as ThreadMessageTimelineRow[],
    orderNotes: (json.orderNotes ?? []) as OrderNoteTimelineRow[],
    signals: (json.signals ?? []) as EntitySignalTimelineRow[],
    carrierEvents: (json.carrierEvents ?? []) as CarrierEvent[],
    rmaEvents: (json.rmaEvents ?? []) as RmaTimelineRow[],
    unitPhotos: (json.unitPhotos ?? []) as UnitTimelinePhotoRow[],
    pickSessions: (json.pickSessions ?? []) as OrderPickSessionRow[],
    packEvents: (json.packEvents ?? []) as StationActivityRow[],
    poLinks: (json.poLinks ?? []) as OrderPoLink[],
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
