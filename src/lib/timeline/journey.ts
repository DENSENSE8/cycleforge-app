import type { TimelineItem, TimelineGroupKey } from './types';
import { TIMELINE_OTHER_BAND_KEY } from './types';
import {
  inventoryEventsToTimeline,
  stationActivityToTimeline,
  orderAuditToTimeline,
  carrierEventsToTimeline,
  warrantyEventsToTimeline,
  threadMessagesToTimeline,
  ticketLinkEventsToTimeline,
  collapseTimeline,
  type InventoryTimelineRow,
  type StationActivityRow,
  type OrderAuditRow,
  type CarrierEvent,
  type WarrantyEventRow,
  type ThreadMessageTimelineRow,
  type TicketLinkTimelineRow,
} from './index';

/** Client-side merge for the Master Operations Journey. */

export type JourneySource =
  | 'sal'
  | 'inventory'
  | 'audit'
  | 'carrier'
  | 'warranty'
  | 'thread'
  | 'ticket';
export type JourneyDimension = 'order' | 'serial' | 'tracking' | 'unit';

export interface JourneyGroupKeys {
  orderId: number | null;
  orderNumber: string | null;
  serialNumber: string | null;
  trackingNumber: string | null;
  station: string | null;
}

export interface JourneyEvent {
  source: JourneySource;
  id: string;
  at: string | null;
  group: JourneyGroupKeys;
  raw: unknown;
}

export interface MergedJourney {
  items: TimelineItem[];
  /** item.id → its resolved grouping keys (object-collision-free via namespaced id). */
  groupOf: Map<string, JourneyGroupKeys>;
}

/**
 * Dispatch each source bucket through its adapter, namespace audit/carrier ids to
 * match the server (so the id→group map can't collide), sort newest-first, and
 * collapse adjacent dupes (which preserves the survivor's id).
 */
export function mergeJourney(events: JourneyEvent[]): MergedJourney {
  const groupOf = new Map<string, JourneyGroupKeys>();
  const sal: StationActivityRow[] = [];
  const inventory: InventoryTimelineRow[] = [];
  const audit: OrderAuditRow[] = [];
  const carrier: CarrierEvent[] = [];
  const warranty: WarrantyEventRow[] = [];
  const thread: ThreadMessageTimelineRow[] = [];
  const ticket: TicketLinkTimelineRow[] = [];

  for (const ev of events) {
    groupOf.set(ev.id, ev.group);
    switch (ev.source) {
      case 'sal':
        sal.push(ev.raw as StationActivityRow);
        break;
      case 'inventory':
        inventory.push(ev.raw as InventoryTimelineRow);
        break;
      case 'audit':
        audit.push(ev.raw as OrderAuditRow);
        break;
      case 'carrier':
        carrier.push(ev.raw as CarrierEvent);
        break;
      case 'warranty':
        warranty.push(ev.raw as WarrantyEventRow);
        break;
      case 'thread':
        thread.push(ev.raw as ThreadMessageTimelineRow);
        break;
      case 'ticket':
        ticket.push(ev.raw as TicketLinkTimelineRow);
        break;
    }
  }

  // sal / inv / warranty adapters already namespace their ids; audit & carrier
  // adapters emit the raw numeric id, so re-namespace to match the server's
  // `audit:`/`carrier:` ids (and stay collision-free in groupOf).
  const merged: TimelineItem[] = [
    ...stationActivityToTimeline(sal),
    ...inventoryEventsToTimeline(inventory),
    ...orderAuditToTimeline(audit).map((it) => ({ ...it, id: `audit:${it.id}` })),
    ...carrierEventsToTimeline(carrier).map((it) => ({ ...it, id: `carrier:${it.id}` })),
    ...warrantyEventsToTimeline(warranty),
    ...threadMessagesToTimeline(thread),
    ...ticketLinkEventsToTimeline(ticket),
  ];

  merged.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });

  return { items: collapseTimeline(merged), groupOf };
}

/** Ship/return round-trip counts for a merged journey (§1 success metric of the returns-unification plan: */
export function countRoundTrips(items: TimelineItem[]): { shippedCount: number; returnedCount: number } {
  let shippedCount = 0;
  let returnedCount = 0;
  for (const item of items) {
    if (item.sourceEventType === 'SHIPPED') shippedCount += 1;
    else if (item.sourceEventType === 'RETURNED') returnedCount += 1;
  }
  return { shippedCount, returnedCount };
}

/** Build the `groupKeyOf` selector for {@link EventTimeline} that buckets each row into its order / serial / tracking journey band. */
export function journeyKeyOf(
  dim: JourneyDimension,
  groupOf: Map<string, JourneyGroupKeys>,
): (item: TimelineItem) => TimelineGroupKey | null {
  const other: TimelineGroupKey = { key: TIMELINE_OTHER_BAND_KEY, label: 'Other events' };
  return (item) => {
    const g = groupOf.get(String(item.id));
    if (!g) return other;
    if (dim === 'order') {
      if (g.orderId == null) return other;
      return {
        key: `order:${g.orderId}`,
        label: g.orderNumber ?? `Order ${g.orderId}`,
        ref: g.orderNumber ? { value: g.orderNumber, kind: 'id' } : undefined,
      };
    }
    if (dim === 'serial') {
      if (!g.serialNumber) return other;
      return { key: `serial:${g.serialNumber}`, label: g.serialNumber, ref: { value: g.serialNumber, kind: 'serial' } };
    }
    // tracking
    if (!g.trackingNumber) return other;
    return {
      key: `tracking:${g.trackingNumber}`,
      label: g.trackingNumber,
      ref: { value: g.trackingNumber, kind: 'tracking' },
    };
  };
}
