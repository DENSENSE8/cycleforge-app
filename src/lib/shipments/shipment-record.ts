/** The shipment (package) record read — one `shipping_tracking_numbers` row assembled into the `ShipmentRecord` contract… */

import pool from '@/lib/db';
import { readInventorySpine } from '@/lib/audit-log/inventory-spine';
import { photoContentUrl } from '@/lib/photos/display-url';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { sqlOrderOwnsShipment } from '@/lib/search/order-tracking-match-sql';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { getTrackingUrl, getTrackingUrlByCarrier, orderTrackingMatchKeys } from '@/lib/tracking-format';
import { listShipmentCarrierEvents, type CarrierEventRow } from './carrier-events';
import type {
  ShipmentRecord,
  ShipmentRecordAction,
  ShipmentRecordItem,
  ShipmentRecordSibling,
} from './shipment-record-types';

type Instant = Date | string | null;

// ─── Raw row shapes ──────────────────────────────────────────────────────────

export interface ShipmentStnRow {
  id: number | string;
  tracking_number_raw: string;
  carrier: string | null;
  latest_status_category: string | null;
  latest_status_label: string | null;
  latest_status_description: string | null;
  latest_event_at: Instant;
  is_delivered: boolean | null;
  has_exception: boolean | null;
  label_created_at: Instant;
  carrier_accepted_at: Instant;
  first_in_transit_at: Instant;
  out_for_delivery_at: Instant;
  delivered_at: Instant;
  exception_at: Instant;
  last_checked_at: Instant;
  last_error_code: string | null;
  last_error_message: string | null;
}

export interface ShipmentItemRow {
  id: number;
  order_id: string | null;
  account_source: string | null;
  sku: string | null;
  product_title: string | null;
  quantity: string | number | null;
  condition: string | null;
  status: string | null;
  zoho_item_title: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  catalog_product_title: string | null;
  catalog_image_url: string | null;
}

export interface ShipmentSerialRow {
  order_row_id: number | null;
  serial_number: string;
  tested_by_name: string | null;
  tested_at: Instant;
  serial_unit_id: number | null;
}

export interface ShipmentPackRow {
  id: number;
  packed_by: number | null;
  packer_name: string | null;
  packed_at: Instant;
  /** SAL twin of this pack log, when one exists (its action already carries it). */
  sal_id: number | null;
}

export interface ShipmentBoxRow {
  shipment_id: number | string;
  tracking: string | null;
  box_seq: number | null;
  is_primary: boolean | null;
  packed_at: Instant;
  packer_name: string | null;
  shipped_at: Instant;
}

export interface ShipmentStationRow {
  id: number;
  created_at: Instant;
  station: string | null;
  activity_type: string;
  scan_ref: string | null;
  staff_id: number | null;
  staff_name: string | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  orders_exception_id: number | null;
  serial_number: string | null;
}

export interface ShipmentExceptionRow {
  id: number;
  exception_reason: string | null;
  status: string;
  notes: string | null;
  source_station: string | null;
  staff_name: string | null;
  created_at: Instant;
}

export interface ShipmentAuditRow {
  id: number | string;
  created_at: Instant;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_staff_id: number | null;
  actor_name: string | null;
  station_activity_log_id: number | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface ShipmentInventoryRow {
  id: number | string;
  occurred_at: Instant;
  event_type: string;
  actor_staff_id: number | null;
  actor_name: string | null;
  station: string | null;
  serial_number: string | null;
  notes: string | null;
}

export interface ShipmentPhotoRow {
  id: number | string;
  taken_at: Instant;
}

export interface ShipmentRecordRows {
  stn: ShipmentStnRow;
  items: ShipmentItemRow[];
  serials: ShipmentSerialRow[];
  /** COMPLETED pack logs of THIS package, newest first. */
  packs: ShipmentPackRow[];
  /** Every package of the owning order(s), this one included. */
  boxes: ShipmentBoxRow[];
  /** `station_activity_logs` for the package (+ exception-linked scans), newest first. */
  station: ShipmentStationRow[];
  /** Matching `orders_exceptions`, open first then newest. */
  exceptions: ShipmentExceptionRow[];
  audits: ShipmentAuditRow[];
  carrier: CarrierEventRow[];
  inventory: ShipmentInventoryRow[];
  photos: ShipmentPhotoRow[];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const SHIPMENT_VISIBLE_SQL = `
  SELECT stn.id, stn.tracking_number_raw, stn.carrier,
         stn.latest_status_category, stn.latest_status_label, stn.latest_status_description,
         stn.latest_event_at, stn.is_delivered, stn.has_exception,
         stn.label_created_at, stn.carrier_accepted_at, stn.first_in_transit_at,
         stn.out_for_delivery_at, stn.delivered_at, stn.exception_at,
         stn.last_checked_at, stn.last_error_code, stn.last_error_message
    FROM shipping_tracking_numbers stn
   WHERE stn.id = $1
     AND (
       stn.organization_id = $2
       OR (
         stn.organization_id IS NULL
         AND (
           EXISTS (SELECT 1 FROM station_activity_logs v_sal WHERE v_sal.shipment_id = stn.id AND v_sal.organization_id = $2)
           OR EXISTS (SELECT 1 FROM shipment_links v_sl WHERE v_sl.shipment_id = stn.id AND v_sl.organization_id = $2)
           OR EXISTS (SELECT 1 FROM orders v_o WHERE v_o.shipment_id = stn.id AND v_o.organization_id = $2)
           OR EXISTS (SELECT 1 FROM packer_logs v_pl WHERE v_pl.shipment_id = stn.id AND v_pl.organization_id = $2)
         )
       )
     )`;

/** The org-visible package, or null. */
export async function readVisibleShipment(orgId: OrgId, shipmentId: number): Promise<ShipmentStnRow | null> {
  const res = await pool.query<ShipmentStnRow>(SHIPMENT_VISIBLE_SQL, [shipmentId, orgId]);
  return res.rows[0] ?? null;
}

/**
 * `orders_exceptions` rows about this package: stamped with its shipment id,
 * linked from one of its scans, or carrying the same tracking (key18). Open
 * first, then newest. Shared with the resolve-exception writer.
 */
export const SHIPMENT_EXCEPTIONS_SQL = `
  SELECT oe.id, oe.exception_reason, oe.status, oe.notes, oe.source_station,
         COALESCE(s.name, oe.staff_name) AS staff_name,
         oe.created_at
    FROM orders_exceptions oe
    LEFT JOIN staff s ON s.id = oe.staff_id AND s.organization_id = oe.organization_id
   WHERE oe.organization_id = $1
     AND (
       oe.shipment_id = $2
       OR oe.id IN (
         SELECT x_sal.orders_exception_id
           FROM station_activity_logs x_sal
          WHERE x_sal.shipment_id = $2
            AND x_sal.organization_id = $1
            AND x_sal.orders_exception_id IS NOT NULL
       )
       OR (
         $3::text <> ''
         AND RIGHT(regexp_replace(UPPER(COALESCE(oe.shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $3::text
       )
     )
   ORDER BY (oe.status = 'open') DESC, oe.created_at DESC NULLS LAST, oe.id DESC
   LIMIT 20`;

async function loadShipmentRecordRows(
  orgId: OrgId,
  shipmentId: number,
): Promise<ShipmentRecordRows | null> {
  const stn = await readVisibleShipment(orgId, shipmentId);
  if (!stn) return null;

  const rows = await withTenantTransaction(orgId, async (client) => {
    const items = (
      await client.query<ShipmentItemRow>(
        `SELECT o.id, o.order_id, o.account_source, o.sku, o.product_title,
                o.quantity, o.condition, o.status,
                zi.name AS zoho_item_title, zi.zoho_item_id,
                zi.image_document_id AS zoho_image_document_id,
                sc.product_title AS catalog_product_title,
                sc.image_url AS catalog_image_url
           FROM orders o
           LEFT JOIN sku_catalog sc ON sc.sku = o.sku AND sc.organization_id = o.organization_id
           LEFT JOIN LATERAL (
             SELECT i.name, i.zoho_item_id, i.image_document_id
               FROM items i
              WHERE i.sku = o.sku AND i.organization_id = o.organization_id AND i.status = 'active'
              ORDER BY i.id
              LIMIT 1
           ) zi ON TRUE
          WHERE o.organization_id = $2
            AND ${sqlOrderOwnsShipment('o', '$1::bigint')}
          ORDER BY o.id`,
        [shipmentId, orgId],
      )
    ).rows;
    const orderIds = items.map((i) => Number(i.id));

    const boxes = orderIds.length
      ? (
          await client.query<ShipmentBoxRow>(
            `WITH owned AS (
               SELECT sl.shipment_id, MIN(sl.box_seq) AS box_seq, BOOL_OR(sl.is_primary) AS is_primary
                 FROM shipment_links sl
                WHERE sl.organization_id = $1
                  AND sl.owner_type = 'ORDER'
                  AND sl.owner_id = ANY($2::int[])
                GROUP BY sl.shipment_id
               UNION ALL
               SELECT o.shipment_id, NULL::int, TRUE
                 FROM orders o
                WHERE o.organization_id = $1
                  AND o.id = ANY($2::int[])
                  AND o.shipment_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM shipment_links sl2
                     WHERE sl2.organization_id = $1
                       AND sl2.owner_type = 'ORDER'
                       AND sl2.owner_id = o.id
                       AND sl2.shipment_id = o.shipment_id
                  )
             ), boxes AS (
               SELECT shipment_id, MIN(box_seq) AS box_seq, BOOL_OR(is_primary) AS is_primary
                 FROM owned
                GROUP BY shipment_id
             )
             SELECT b.shipment_id, stn.tracking_number_raw AS tracking, b.box_seq, b.is_primary,
                    pack.packed_at, pack.packer_name, ship.shipped_at
               FROM boxes b
               LEFT JOIN shipping_tracking_numbers stn ON stn.id = b.shipment_id
               LEFT JOIN LATERAL (
                 SELECT pl.created_at AS packed_at, s.name AS packer_name
                   FROM packer_logs pl
                   LEFT JOIN staff s ON s.id = pl.packed_by AND s.organization_id = pl.organization_id
                  WHERE pl.organization_id = $1
                    AND pl.shipment_id = b.shipment_id
                    AND pl.completion_state = 'COMPLETED'
                  ORDER BY 1 DESC, pl.id DESC
                  LIMIT 1
               ) pack ON TRUE
               LEFT JOIN LATERAL (
                 SELECT MAX(so.created_at) AS shipped_at
                   FROM station_activity_logs so
                  WHERE so.organization_id = $1
                    AND so.activity_type = 'SHIP_CONFIRM'
                    AND so.shipment_id = b.shipment_id
               ) ship ON TRUE
              ORDER BY b.box_seq ASC NULLS LAST, b.shipment_id ASC`,
            [orgId, orderIds],
          )
        ).rows
      : [];
    const otherBoxIds = boxes.map((b) => Number(b.shipment_id)).filter((id) => id !== shipmentId);

    const packs = (
      await client.query<ShipmentPackRow>(
        `SELECT pl.id, pl.packed_by, s.name AS packer_name,
                pl.created_at AS packed_at,
                (SELECT MIN(tw.id) FROM station_activity_logs tw
                  WHERE tw.shipment_id = pl.shipment_id
                    AND tw.packer_log_id = pl.id
                    AND tw.organization_id = pl.organization_id) AS sal_id
           FROM packer_logs pl
           LEFT JOIN staff s ON s.id = pl.packed_by AND s.organization_id = pl.organization_id
          WHERE pl.organization_id = $1
            AND pl.shipment_id = $2
            AND pl.completion_state = 'COMPLETED'
          ORDER BY packed_at DESC, pl.id DESC
          LIMIT 20`,
        [orgId, shipmentId],
      )
    ).rows;

    const exceptions = (
      await client.query<ShipmentExceptionRow>(SHIPMENT_EXCEPTIONS_SQL, [
        orgId,
        shipmentId,
        orderTrackingMatchKeys(stn.tracking_number_raw).key18,
      ])
    ).rows;
    const exceptionIds = exceptions.map((e) => Number(e.id));

    const serials = (
      await client.query<ShipmentSerialRow>(
        `SELECT x.order_row_id, x.serial_number, x.tested_by_name, x.tested_at, x.serial_unit_id
           FROM (
             SELECT tsn.order_id AS order_row_id, BTRIM(tsn.serial_number) AS serial_number,
                    s.name AS tested_by_name, tsn.created_at AS tested_at,
                    tsn.serial_unit_id, 0 AS src, tsn.id AS sort_id
               FROM tech_serial_numbers tsn
               LEFT JOIN staff s ON s.id = tsn.tested_by AND s.organization_id = tsn.organization_id
              WHERE tsn.organization_id = $1
                AND NULLIF(BTRIM(tsn.serial_number), '') IS NOT NULL
                AND (
                  tsn.shipment_id = $2
                  OR (
                    tsn.order_id = ANY($3::int[])
                    AND (tsn.shipment_id IS NULL OR NOT (tsn.shipment_id = ANY($4::bigint[])))
                  )
                )
             UNION ALL
             SELECT oua.order_id, BTRIM(su.serial_number), NULL, NULL, su.id, 1, oua.id
               FROM order_unit_allocations oua
               JOIN serial_units su ON su.id = oua.serial_unit_id AND su.organization_id = oua.organization_id
              WHERE oua.organization_id = $1
                AND oua.order_id = ANY($3::int[])
                AND oua.released_at IS NULL
                AND NULLIF(BTRIM(su.serial_number), '') IS NOT NULL
           ) x
          ORDER BY x.src, x.sort_id`,
        [orgId, shipmentId, orderIds, otherBoxIds],
      )
    ).rows;

    const station = (
      await client.query<ShipmentStationRow>(
        `SELECT sal.id, sal.created_at, sal.station, sal.activity_type, sal.scan_ref,
                sal.staff_id, s.name AS staff_name, sal.metadata, sal.notes,
                sal.orders_exception_id,
                COALESCE(
                  NULLIF(BTRIM(tsn.serial_number), ''),
                  NULLIF(BTRIM(sal.metadata->>'serial'), '')
                ) AS serial_number
           FROM station_activity_logs sal
           LEFT JOIN staff s ON s.id = sal.staff_id AND s.organization_id = sal.organization_id
           LEFT JOIN tech_serial_numbers tsn
             ON tsn.id = sal.tech_serial_number_id AND tsn.organization_id = sal.organization_id
          WHERE sal.organization_id = $1
            AND (sal.shipment_id = $2 OR sal.orders_exception_id = ANY($3::int[]))
          ORDER BY sal.created_at DESC, sal.id DESC
          LIMIT 300`,
        [orgId, shipmentId, exceptionIds],
      )
    ).rows;

    const packIds = packs.map((p) => String(p.id));
    const audits = (
      await client.query<ShipmentAuditRow>(
        `SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id,
                al.actor_staff_id, s.name AS actor_name, al.station_activity_log_id,
                al.after_data, al.metadata
           FROM audit_logs al
           LEFT JOIN staff s ON s.id = al.actor_staff_id AND s.organization_id = al.organization_id
           LEFT JOIN station_activity_logs asal ON asal.id = al.station_activity_log_id
          WHERE al.organization_id = $1
            AND (
              (al.entity_type = ANY(ARRAY['SHIPMENT', 'shipment']) AND al.entity_id = $2::text)
              OR (al.entity_type = ANY(ARRAY['ORDER', 'order']) AND al.entity_id = ANY($3::text[]))
              OR (al.entity_type = ANY(ARRAY['ORDERS_EXCEPTION', 'orders_exception']) AND al.entity_id = ANY($4::text[]))
              OR (al.entity_type = ANY(ARRAY['PACKER_LOG', 'packer_log']) AND al.entity_id = ANY($5::text[]))
            )
            -- An order-anchored scan of a SIBLING box is that box's fact, not this one's.
            AND (asal.id IS NULL OR asal.shipment_id IS NULL OR asal.shipment_id = $2::bigint)
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT 300`,
        [orgId, shipmentId, orderIds.map(String), exceptionIds.map(String), packIds],
      )
    ).rows;

    const photos = packs.length
      ? (
          await client.query<ShipmentPhotoRow>(
            `SELECT p.id, COALESCE(p.client_captured_at, p.created_at) AS taken_at
               FROM photo_entity_links l
               JOIN photos p ON p.id = l.photo_id AND p.organization_id = l.organization_id
              WHERE l.organization_id = $1
                AND l.entity_type = 'PACKER_LOG'
                AND l.link_role = 'primary'
                AND l.entity_id = ANY($2::bigint[])
              ORDER BY taken_at ASC, p.id ASC`,
            [orgId, packs.map((p) => Number(p.id))],
          )
        ).rows
      : [];

    return { items, serials, packs, boxes, station, exceptions, audits, photos };
  });

  const carrier = await listShipmentCarrierEvents(shipmentId);

  const unitIds = Array.from(
    new Set(rows.serials.map((s) => Number(s.serial_unit_id)).filter((id) => Number.isFinite(id) && id > 0)),
  );
  const inventory = unitIds.length
    ? ((await readInventorySpine({ serialUnitIds: unitIds, order: 'desc', limit: 200 }, orgId)) as unknown as ShipmentInventoryRow[])
    : [];

  return { stn, ...rows, carrier, inventory };
}

// ─── Pure shaping ────────────────────────────────────────────────────────────

function isoInstant(value: Instant | undefined): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clean(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s ? s : null;
}

/** `WS_ORDER_TESTED` / `order.document.bundle_print` → `Ws order tested` / `Order document bundle print`. */
function humanizeVerb(verb: string): string {
  const words = verb.replace(/[._\-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : verb;
}

/** `metadata.source` naming an ops backfill (`ops-backfill-scan-out` …), not a live dock scan. */
function isBackfillSource(metadata: Record<string, unknown> | null | undefined): boolean {
  return /backfill/i.test(String(metadata?.source ?? ''));
}

const STATION_LABELS: Record<string, string> = {
  PACK_COMPLETED: 'Packed',
  PACK_SCAN: 'Pack scan',
  FBA_READY: 'FBA ready',
  SHIP_CONFIRM: 'Scanned out at the dock',
  TRACKING_SCANNED: 'Tech scanned the tracking',
  SERIAL_ADDED: 'Serial added',
  WS_ORDER_TESTED: 'Tested',
  LABEL_PRINTED: 'Label printed',
  FNSKU_SCANNED: 'FNSKU scanned',
};

const AUDIT_LABELS: Record<string, string> = {
  PACK_COMPLETED: 'Packed',
  'shipment.scan_out': 'Scanned out',
  'shipment.scan_out.undo': 'Scan-out undone',
  'orders.tracking.added': 'Tracking added',
  'orders.label.printed': 'Label printed',
  'orders.label.purchased': 'Label purchased',
  'orders.label.voided': 'Label voided',
  'orders.label.linked': 'Label linked',
  'orders.label.unlinked': 'Label unlinked',
  'orders_exceptions.resolve': 'Unmatched scan linked to an order',
  'orders_exceptions.close': 'Unmatched scan closed',
  'orders_exceptions.update': 'Unmatched scan tracking edited',
  'orders_exceptions.sync': 'Exception sync matched the order',
  'order.create': 'Order created',
  'orders.import': 'Order imported',
  'orders.update': 'Order edited',
  'orders.delete': 'Order deleted',
  ORDER_ASSIGNMENT_UPDATED: 'Assignment changed',
  'order.document.bundle_print': 'Documents printed',
  'order.document.bundle_reprint': 'Documents reprinted',
  'order.document.attach': 'Document attached',
  'order.pack_place': 'Placed for packing',
  'order.pack_move': 'Pack placement moved',
  'order.pack_clear': 'Pack placement cleared',
  'order.cage': 'Caged',
  'order.release': 'Released',
  'support.ticket.linked': 'Support ticket linked',
};

function stationAction(row: ShipmentStationRow): ShipmentRecordAction | null {
  const at = isoInstant(row.created_at);
  if (!at) return null;
  const kind = String(row.activity_type);
  const backfilled = kind === 'SHIP_CONFIRM' && isBackfillSource(row.metadata);
  let label = STATION_LABELS[kind] ?? humanizeVerb(kind);
  let detail: string | null = null;
  if (backfilled) {
    label = 'Scan-out backfilled';
    detail = `Ops backfill (${clean(row.metadata?.source) ?? 'backfill'}), not a live dock scan`;
  } else if (kind === 'SERIAL_ADDED') {
    detail = clean(row.serial_number);
  } else if (row.orders_exception_id != null && kind.startsWith('PACK')) {
    label = 'Packed — no matching order';
    detail = 'Pack scan did not match an order';
  }
  return {
    id: `station:${row.id}`,
    at,
    source: 'station',
    kind,
    label,
    actorStaffId: row.staff_id ?? null,
    actorName: clean(row.staff_name),
    station: clean(row.station),
    detail: detail ?? clean(row.notes),
  };
}

function auditAction(row: ShipmentAuditRow): ShipmentRecordAction | null {
  const at = isoInstant(row.created_at);
  if (!at) return null;
  const after = row.after_data ?? {};
  const meta = row.metadata ?? {};
  return {
    id: `audit:${row.id}`,
    at,
    source: 'audit',
    kind: row.action,
    label: AUDIT_LABELS[row.action] ?? humanizeVerb(row.action),
    actorStaffId: row.actor_staff_id ?? null,
    actorName: clean(row.actor_name),
    station: null,
    detail: clean(meta.note) ?? clean(after.reason) ?? clean(after.order_ref) ?? null,
  };
}

function carrierAction(row: CarrierEventRow, carrierName: string | null): ShipmentRecordAction | null {
  const at = isoInstant(row.event_occurred_at);
  if (!at) return null;
  const what =
    clean(row.external_status_description) ??
    clean(row.external_status_label) ??
    humanizeVerb(String(row.normalized_status_category ?? 'Update'));
  const place = [clean(row.event_city), clean(row.event_state)].filter(Boolean).join(', ');
  const extra = [
    place || null,
    clean(row.exception_description),
    row.signed_by ? `Signed by ${String(row.signed_by).trim()}` : null,
  ].filter(Boolean);
  return {
    id: `carrier:${row.id}`,
    at,
    source: 'carrier',
    kind: String(row.normalized_status_category ?? 'UNKNOWN'),
    label: carrierName ? `${carrierName}: ${what}` : what,
    actorStaffId: null,
    actorName: null,
    station: null,
    detail: extra.length ? extra.join(' · ') : null,
  };
}

function ordinalByBoxSeq(boxes: ShipmentBoxRow[]): Map<number, number> {
  const sorted = [...boxes].sort((a, b) => {
    const sa = a.box_seq ?? Number.MAX_SAFE_INTEGER;
    const sb = b.box_seq ?? Number.MAX_SAFE_INTEGER;
    return sa - sb || Number(a.shipment_id) - Number(b.shipment_id);
  });
  return new Map(sorted.map((b, i) => [Number(b.shipment_id), i + 1]));
}

export function buildShipmentRecord(rows: ShipmentRecordRows): ShipmentRecord {
  const shipmentId = Number(rows.stn.id);
  const tracking = rows.stn.tracking_number_raw;
  const carrierName = clean(rows.stn.carrier);

  // ── items + serials
  const items: ShipmentRecordItem[] = rows.items.map((o) => ({
    orderRowId: Number(o.id),
    orderRef: clean(o.order_id),
    channel: clean(o.account_source),
    sku: clean(o.sku),
    title:
      resolveSkuIdentityTitle({
        zoho_item_title: o.zoho_item_title,
        catalog_product_title: o.catalog_product_title,
        item_name: o.product_title,
        sku: o.sku,
      }) || 'Unknown product',
    photoUrl: productImageUrl({
      zohoItemId: o.zoho_item_id,
      zohoImageDocumentId: o.zoho_image_document_id,
      catalogImageUrl: o.catalog_image_url,
    }),
    quantity: o.quantity == null || o.quantity === '' || !Number.isFinite(Number(o.quantity)) ? null : Number(o.quantity),
    condition: clean(o.condition),
    orderStatus: clean(o.status),
    serials: [],
  }));
  const byOrder = new Map(items.map((i) => [i.orderRowId, i]));
  const seenSerial = new Map<ShipmentRecordItem, Set<string>>();
  for (const s of rows.serials) {
    const serial = clean(s.serial_number);
    if (!serial) continue;
    const item = (s.order_row_id != null ? byOrder.get(Number(s.order_row_id)) : undefined) ?? items[0];
    if (!item) continue;
    const seen = seenSerial.get(item) ?? new Set<string>();
    seenSerial.set(item, seen);
    const key = serial.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    item.serials.push({ serial, testedByName: clean(s.tested_by_name), testedAt: isoInstant(s.tested_at) });
  }

  // ── pack / ship-out
  const latestPack = rows.packs.find((p) => isoInstant(p.packed_at) != null) ?? null;
  const pack = latestPack
    ? {
        packerLogId: Number(latestPack.id),
        packerStaffId: latestPack.packed_by ?? null,
        packerName: clean(latestPack.packer_name),
        packedAt: isoInstant(latestPack.packed_at) as string,
      }
    : null;
  const shipRow = rows.station.find((r) => r.activity_type === 'SHIP_CONFIRM' && isoInstant(r.created_at));
  const shipOut = shipRow
    ? {
        at: isoInstant(shipRow.created_at) as string,
        staffId: shipRow.staff_id ?? null,
        staffName: clean(shipRow.staff_name),
        backfilled: isBackfillSource(shipRow.metadata),
      }
    : null;

  // ── box + siblings
  const ordinal = ordinalByBoxSeq(rows.boxes);
  const self = rows.boxes.find((b) => Number(b.shipment_id) === shipmentId);
  const box = rows.boxes.length
    ? {
        seq: self ? ordinal.get(shipmentId) ?? null : null,
        isPrimary: Boolean(self?.is_primary),
        total: rows.boxes.length,
      }
    : null;
  const siblings: ShipmentRecordSibling[] = rows.boxes
    .filter((b) => Number(b.shipment_id) !== shipmentId)
    .map((b) => ({
      shipmentId: Number(b.shipment_id),
      tracking: clean(b.tracking) ?? `#${b.shipment_id}`,
      boxSeq: ordinal.get(Number(b.shipment_id)) ?? null,
      isPrimary: Boolean(b.is_primary),
      packedAt: isoInstant(b.packed_at),
      packerName: clean(b.packer_name),
      shippedAt: isoInstant(b.shipped_at),
    }))
    .sort((a, b) => (a.boxSeq ?? Infinity) - (b.boxSeq ?? Infinity));

  // ── exception
  const ex = rows.exceptions[0] ?? null;
  const exception = ex
    ? {
        id: Number(ex.id),
        reason: clean(ex.exception_reason),
        status: String(ex.status),
        notes: clean(ex.notes),
        sourceStation: clean(ex.source_station),
        staffName: clean(ex.staff_name),
        createdAt: isoInstant(ex.created_at),
      }
    : null;

  // ── photos
  const photos = rows.photos.map((p) => ({
    id: Number(p.id),
    url: photoContentUrl(Number(p.id)),
    takenAt: isoInstant(p.taken_at),
  }));

  // ── actions
  const actions: ShipmentRecordAction[] = [];
  const salIds = new Set(rows.station.map((r) => Number(r.id)));
  for (const r of rows.station) {
    const a = stationAction(r);
    if (a) actions.push(a);
  }
  for (const p of rows.packs) {
    if (p.sal_id != null && salIds.has(Number(p.sal_id))) continue;
    const at = isoInstant(p.packed_at);
    if (!at) continue;
    actions.push({
      id: `station:packer_log-${p.id}`,
      at,
      source: 'station',
      kind: 'PACK_COMPLETED',
      label: 'Packed',
      actorStaffId: p.packed_by ?? null,
      actorName: clean(p.packer_name),
      station: 'PACK',
      detail: null,
    });
  }
  for (const r of rows.audits) {
    // The audit twin of a scan already on the ledger adds nothing but a duplicate.
    if (r.station_activity_log_id != null && salIds.has(Number(r.station_activity_log_id))) continue;
    const a = auditAction(r);
    if (a) actions.push(a);
  }
  for (const r of rows.carrier) {
    const a = carrierAction(r, carrierName);
    if (a) actions.push(a);
  }
  for (const e of rows.exceptions) {
    const at = isoInstant(e.created_at);
    if (!at) continue;
    actions.push({
      id: `exception:${e.id}`,
      at,
      source: 'exception',
      kind: `orders_exception.${String(e.exception_reason ?? 'open')}`,
      label: 'Unmatched scan held as an exception',
      actorStaffId: null,
      actorName: clean(e.staff_name),
      station: clean(e.source_station),
      detail: [clean(e.exception_reason), clean(e.notes)].filter(Boolean).join(' · ') || null,
    });
  }
  for (const r of rows.inventory) {
    const at = isoInstant(r.occurred_at);
    if (!at) continue;
    actions.push({
      id: `inventory:${r.id}`,
      at,
      source: 'inventory',
      kind: r.event_type,
      label: humanizeVerb(r.event_type),
      actorStaffId: r.actor_staff_id ?? null,
      actorName: clean(r.actor_name),
      station: clean(r.station),
      detail: [clean(r.serial_number), clean(r.notes)].filter(Boolean).join(' · ') || null,
    });
  }
  for (const p of photos) {
    if (!p.takenAt) continue;
    actions.push({
      id: `photo:${p.id}`,
      at: p.takenAt,
      source: 'photo',
      kind: 'PACK_PHOTO',
      label: 'Pack photo',
      actorStaffId: null,
      actorName: null,
      station: 'PACK',
      detail: null,
    });
  }
  // Newest first; ties keep a stable order by id so refetches never reshuffle.
  actions.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  return {
    shipmentId,
    tracking,
    carrier: carrierName,
    trackingUrl: (carrierName ? getTrackingUrlByCarrier(tracking, carrierName) : null) ?? getTrackingUrl(tracking),
    status: {
      category: clean(rows.stn.latest_status_category),
      label: clean(rows.stn.latest_status_label),
      description: clean(rows.stn.latest_status_description),
      latestEventAt: isoInstant(rows.stn.latest_event_at),
      isDelivered:
        Boolean(rows.stn.is_delivered) ||
        rows.stn.delivered_at != null ||
        String(rows.stn.latest_status_category ?? '').toUpperCase() === 'DELIVERED',
      hasException: Boolean(rows.stn.has_exception),
    },
    pack,
    shipOut,
    carrierMilestones: {
      labelCreatedAt: isoInstant(rows.stn.label_created_at),
      acceptedAt: isoInstant(rows.stn.carrier_accepted_at),
      inTransitAt: isoInstant(rows.stn.first_in_transit_at),
      outForDeliveryAt: isoInstant(rows.stn.out_for_delivery_at),
      deliveredAt: isoInstant(rows.stn.delivered_at),
      exceptionAt: isoInstant(rows.stn.exception_at),
    },
    sync: {
      lastCheckedAt: isoInstant(rows.stn.last_checked_at),
      lastErrorCode: clean(rows.stn.last_error_code),
      lastErrorMessage: clean(rows.stn.last_error_message),
    },
    box,
    items,
    siblings,
    exception,
    photos,
    actions,
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

interface ShipmentRecordDeps {
  loadRows: (orgId: OrgId, shipmentId: number) => Promise<ShipmentRecordRows | null>;
}

const defaultDeps: ShipmentRecordDeps = { loadRows: loadShipmentRecordRows };

/** The package record, or null when the id is unknown or not visible to `orgId`. */
export async function getShipmentRecord(
  orgId: OrgId,
  shipmentId: number,
  deps: ShipmentRecordDeps = defaultDeps,
): Promise<ShipmentRecord | null> {
  const rows = await deps.loadRows(orgId, shipmentId);
  return rows ? buildShipmentRecord(rows) : null;
}
