/** Order search-feedback station sections — map timeline events / photo stages onto Receiving · Unbox · Testing · Shipping · More. */

import type { UnitTimelinePhotoRowSource } from './unit-photos-events';
import type { TimelineItem } from './types';

export const ORDER_STATION_SECTION_IDS = [
  'receiving',
  'unbox',
  'testing',
  'shipping',
  'more',
] as const;

export type OrderStationSectionId = (typeof ORDER_STATION_SECTION_IDS)[number];

/**
 * Search-feedback accordion order — packing-focused: latest outbound station
 * first, then walk back through Testing → Unbox → Receiving, with More last.
 */
export const ORDER_STATION_PACKING_FIRST_IDS: ReadonlyArray<OrderStationSectionId> = [
  'shipping',
  'testing',
  'unbox',
  'receiving',
  'more',
];

export const ORDER_STATION_SECTION_LABELS: Record<OrderStationSectionId, string> = {
  receiving: 'Receiving',
  unbox: 'Unbox',
  testing: 'Testing',
  shipping: 'Shipping',
  more: 'More',
};

/** Inventory `event_type` → station (unmapped → more). */
const INVENTORY_STATION: Record<string, OrderStationSectionId> = {
  RECEIVED: 'receiving',
  TRIAGED: 'receiving',
  TEST_START: 'testing',
  TEST_PASS: 'testing',
  TEST_FAIL: 'testing',
  DATA_WIPED: 'testing',
  GRADED: 'testing',
  PICKED: 'shipping',
  PACKED: 'shipping',
  SHIPPED: 'shipping',
  ALLOCATED: 'shipping',
  LABELED: 'shipping',
  STAGED: 'shipping',
};

/** SAL `activity_type` → station (unmapped → more). */
const SAL_STATION: Record<string, OrderStationSectionId> = {
  TRACKING_SCANNED: 'testing',
  FNSKU_SCANNED: 'testing',
  SERIAL_ADDED: 'testing',
  PACK_COMPLETED: 'shipping',
  PACK_SCAN: 'shipping',
  PACK_SHIPPED: 'shipping',
  SHIP_CONFIRM: 'shipping',
  FBA_READY: 'shipping',
  LABEL_PRINTED: 'shipping',
};

/** Photo wire-source → station. */
const PHOTO_SOURCE_STATION: Record<UnitTimelinePhotoRowSource, OrderStationSectionId> = {
  arrival: 'receiving',
  unbox_carton: 'unbox',
  unbox_item: 'unbox',
  testing: 'testing',
  packing: 'shipping',
};

/** Timeline `sourceEventType` for photo-stage rows (from unitPhotosToTimeline). */
const PHOTO_EVENT_STATION: Record<string, OrderStationSectionId> = {
  ARRIVAL_PHOTOS: 'receiving',
  UNBOX_PHOTOS: 'unbox',
  TEST_PHOTOS: 'testing',
  PACK_PHOTOS: 'shipping',
};

/** Carrier / notes / system / RMA stay on More. */
const MORE_EVENT_TYPES = new Set([
  'CARRIER_EVENT',
  'THREAD_MESSAGE',
  'RMA_AUTHORIZED',
  'RMA_CLOSED',
  'TICKET_NOTE',
  'TICKET_MESSAGE',
  'TICKET_LINKED',
  'TICKET_UNLINKED',
  'orders.update',
  'ORDER_ASSIGNMENT_UPDATED',
  'orders.delete',
]);

/** Order audit `action` → station (shipping-facing audit). */
const AUDIT_STATION: Record<string, OrderStationSectionId> = {
  PACK_COMPLETED: 'shipping',
  SHIP_CONFIRM: 'shipping',
  'shipment.scan_out': 'shipping',
  'orders.label.printed': 'shipping',
  'orders.tracking.added': 'shipping',
};

/**
 * Classify a timeline item into a station section. Prefer `sourceEventType`;
 * fall through inventory / SAL maps; unknown → More.
 */
export function orderStationForTimelineItem(item: TimelineItem): OrderStationSectionId {
  const type = String(item.sourceEventType ?? '').trim();
  if (!type) return 'more';

  if (PHOTO_EVENT_STATION[type]) return PHOTO_EVENT_STATION[type];
  if (MORE_EVENT_TYPES.has(type)) return 'more';
  if (INVENTORY_STATION[type]) return INVENTORY_STATION[type];
  if (SAL_STATION[type]) return SAL_STATION[type];
  if (AUDIT_STATION[type]) return AUDIT_STATION[type];

  return 'more';
}

/** Classify a unit-timeline photo wire source. */
export function orderStationForPhotoSource(
  source: UnitTimelinePhotoRowSource,
): OrderStationSectionId {
  return PHOTO_SOURCE_STATION[source];
}

export function filterTimelineByStation(
  items: TimelineItem[],
  station: OrderStationSectionId,
): TimelineItem[] {
  return items.filter((item) => orderStationForTimelineItem(item) === station);
}

export function countTimelineByStation(
  items: TimelineItem[],
): Record<OrderStationSectionId, number> {
  const counts: Record<OrderStationSectionId, number> = {
    receiving: 0,
    unbox: 0,
    testing: 0,
    shipping: 0,
    more: 0,
  };
  for (const item of items) {
    counts[orderStationForTimelineItem(item)] += 1;
  }
  return counts;
}

/**
 * Default open accordion row: first packing-first station with ≥1 event; else
 * Shipping when packed/scanned-out stamps exist; else More.
 */
export function resolveDefaultOrderStationTab(input: {
  counts: Record<OrderStationSectionId, number>;
  hasPackedOrShippedStamp?: boolean;
}): OrderStationSectionId {
  for (const id of ORDER_STATION_PACKING_FIRST_IDS) {
    if (id === 'more') continue;
    if ((input.counts[id] ?? 0) > 0) return id;
  }
  if (input.hasPackedOrShippedStamp) return 'shipping';
  return 'more';
}
