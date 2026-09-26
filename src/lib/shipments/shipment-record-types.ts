/**
 * The shipment (package) record — one carrier tracking number
 * (`shipping_tracking_numbers.id`) read as a whole: the order lines inside the
 * box, who packed it and when, when it left the dock, what the carrier saw, and
 * every action any station, person or carrier took on it.
 *
 * Keyed by the PACKAGE, not the order line: a pack scan can match no order
 * (an open `orders_exceptions` row), and a multi-box order ships each box at
 * its own time. Served by `GET /api/shipments/[id]/record`; painted by the
 * Shipped desk ledger (`DeskRecordPlane`) and the phone hub
 * (`/m/shipping/shipments/[shipmentId]`).
 *
 * Every instant is an ISO-8601 string WITH an offset (`…Z`), never a bare wall
 * clock — the client formats it in the operator's zone.
 */

export interface ShipmentRecordSerial {
  serial: string;
  testedByName: string | null;
  testedAt: string | null;
}

/** One order line in the box. `title` follows the SKU identity law (Zoho item first). */
export interface ShipmentRecordItem {
  orderRowId: number;
  /** Marketplace order number (`orders.order_id`). */
  orderRef: string | null;
  /** `orders.account_source` — ebay / ecwid / amazon / fba … */
  channel: string | null;
  sku: string | null;
  title: string;
  photoUrl: string | null;
  quantity: number | null;
  condition: string | null;
  orderStatus: string | null;
  serials: ShipmentRecordSerial[];
}

/** Another package on the same order(s) — `shipment_links` siblings. */
export interface ShipmentRecordSibling {
  shipmentId: number;
  tracking: string;
  boxSeq: number | null;
  isPrimary: boolean;
  packedAt: string | null;
  packerName: string | null;
  shippedAt: string | null;
}

export type ShipmentActionSource =
  | 'station'
  | 'audit'
  | 'carrier'
  | 'exception'
  | 'inventory'
  | 'photo'
  | 'note';

export interface ShipmentRecordAction {
  /** Stable across refetches: `<source>:<row id>`. */
  id: string;
  at: string;
  source: ShipmentActionSource;
  /** Machine verb (`PACK_COMPLETED`, `SHIP_CONFIRM`, `IN_TRANSIT`, `orders_exception.resolve` …). */
  kind: string;
  /** Operator sentence (`Packed`, `Scanned out at the dock`, `UPS: Departed facility`). */
  label: string;
  actorStaffId: number | null;
  actorName: string | null;
  station: string | null;
  /** Secondary line — location, note, reason. */
  detail: string | null;
}

export interface ShipmentRecordException {
  id: number;
  reason: string | null;
  status: string;
  notes: string | null;
  sourceStation: string | null;
  staffName: string | null;
  createdAt: string | null;
}

export interface ShipmentRecordPhoto {
  id: number;
  url: string;
  takenAt: string | null;
}

export interface ShipmentRecord {
  shipmentId: number;
  tracking: string;
  carrier: string | null;
  trackingUrl: string | null;
  status: {
    category: string | null;
    label: string | null;
    description: string | null;
    latestEventAt: string | null;
    isDelivered: boolean;
    hasException: boolean;
  };
  /** Latest COMPLETED pack of THIS package; null when the box was never pack-scanned. */
  pack: {
    packerLogId: number;
    packerStaffId: number | null;
    packerName: string | null;
    packedAt: string;
  } | null;
  /** Latest dock scan-out (`SHIP_CONFIRM`); `backfilled` when it was an ops backfill, not a live scan. */
  shipOut: {
    at: string;
    staffId: number | null;
    staffName: string | null;
    backfilled: boolean;
  } | null;
  carrierMilestones: {
    labelCreatedAt: string | null;
    acceptedAt: string | null;
    inTransitAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
    exceptionAt: string | null;
  };
  /** Carrier sync health — why carrier facts may be missing. */
  sync: {
    lastCheckedAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
  /** This box's place on its order (`shipment_links.box_seq`), when linked. */
  box: { seq: number | null; isPrimary: boolean; total: number } | null;
  items: ShipmentRecordItem[];
  siblings: ShipmentRecordSibling[];
  /** The OPEN or latest unmatched-scan exception for this tracking number. */
  exception: ShipmentRecordException | null;
  photos: ShipmentRecordPhoto[];
  /** Newest first. */
  actions: ShipmentRecordAction[];
}

/** `POST /api/shipments/[id]/resolve-exception` body. */
export type ResolveShipmentExceptionBody =
  | { kind: 'link-order'; orderRowId: number; clientEventId: string }
  | { kind: 'close'; reason: string; clientEventId: string };

export interface ResolveShipmentExceptionResult {
  ok: true;
  idempotent: boolean;
  record: ShipmentRecord;
}

/** `GET /api/shipments/lookup?tracking=` — exact / key18 / last-8 resolution. */
export interface ShipmentLookupResult {
  shipmentId: number;
  tracking: string;
}

/** Desk deep-link param: `/shipping/shipped?shipment=<id>`. */
export const SHIPMENT_RECORD_PARAM = 'shipment';
