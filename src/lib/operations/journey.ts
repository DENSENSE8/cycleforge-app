import 'server-only';

import type { PoolClient } from 'pg';
import { readInventorySpine } from '@/lib/audit-log/inventory-spine';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  OrderAuditRow,
  InventoryTimelineRow,
  StationActivityRow,
  CarrierEvent,
  WarrantyEventRow,
  ThreadMessageTimelineRow,
  TicketLinkTimelineRow,
} from '@/lib/timeline';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import {
  ENTITY_WINDOW_MS,
  MAX_LIMIT,
  SOURCE_PREFIX,
  buildBrowseQuery,
  clampLimit,
  mapStationsToSpines,
  normalizeSerial,
  resolveSources,
  sortJourneyDesc,
  windowBounds,
  type BrowseRow,
  type EntityAnchors,
  type JourneyCursor,
  type JourneyDimension,
  type JourneyEvent,
  type JourneyFilters,
  type JourneySource,
  type SerialProvenance,
} from './journey-helpers';

// Re-export the pure helpers + types so callers import a single module.
export * from './journey-helpers';

/**
 * Master Operations Journey — the org-scoped, multi-spine event reader that powers
 * the rebuilt Operations ▸ History view. ENTITY mode resolves + org-gates a
 * specific order/serial/tracking and fans out indexed point-lookups across the
 * five spines (SAL, inventory_events, audit_logs, carrier, warranty), merged in
 * JS. BROWSE mode runs the keyset-paginated UNION (`buildBrowseQuery`).
 *
 * TENANT SAFETY: `shipping_tracking_numbers` / `shipment_tracking_events` have NO
 * `organization_id` — they are reached ONLY via an org-verified `orders.shipment_id`.
 * TRACKING mode 404s if no org-owned order references the shipment, so a tenant
 * can't probe another tenant's carrier trail via a globally-unique tracking number.
 *
 * Pure helpers (cursor codec, source pruning, browse SQL) live in
 * `./journey-helpers` (DB-free, unit-tested); this module holds the DB readers.
 */

export interface JourneyDeps {
  readInventorySpine: typeof readInventorySpine;
}
const defaultDeps: JourneyDeps = { readInventorySpine };

export interface JourneyBrowseResult {
  events: JourneyEvent[];
  nextCursor: JourneyCursor | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity resolution (org-gated)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveOrderAnchors(
  client: PoolClient,
  orgId: OrgId,
  orderRow: { id: number; order_id: string | null; shipment_id: number | null },
): Promise<EntityAnchors> {
  // Serial set = allocation path ∪ tech-serial (order_id prefer; sole-shipment dual-read).
  const serialRes = await client.query<{ serial_unit_id: number | null; serial_number: string | null }>(
    `SELECT serial_unit_id, serial_number FROM (
        SELECT oua.serial_unit_id, su.serial_number
          FROM order_unit_allocations oua
          JOIN serial_units su ON su.id = oua.serial_unit_id AND su.organization_id = $2
         WHERE oua.order_id = $1 AND oua.organization_id = $2
        UNION
        SELECT tsn.serial_unit_id, tsn.serial_number
          FROM tech_serial_numbers tsn
         WHERE tsn.organization_id = $2
           AND (
             tsn.order_id = $1
             OR (
               tsn.order_id IS NULL
               AND $3::int IS NOT NULL
               AND tsn.shipment_id = $3
               AND NOT EXISTS (
                 SELECT 1 FROM orders o2
                 WHERE o2.shipment_id = $3
                   AND o2.organization_id = $2
                   AND o2.id <> $1
               )
             )
           )
     ) s
     LIMIT 500`,
    [orderRow.id, orgId, orderRow.shipment_id],
  );

  const serialUnitIds = Array.from(
    new Set(
      serialRes.rows
        .map((r) => (r.serial_unit_id == null ? null : Number(r.serial_unit_id)))
        .filter((v): v is number => v != null && Number.isFinite(v)),
    ),
  );
  const serials = Array.from(
    new Set(serialRes.rows.map((r) => (r.serial_number || '').trim()).filter((s) => s.length > 0)),
  );

  const trackingNumbers: string[] = [];
  if (orderRow.shipment_id != null) {
    const trk = await client.query<{ tracking_number_raw: string | null }>(
      `SELECT tracking_number_raw FROM shipping_tracking_numbers WHERE id = $1`,
      [orderRow.shipment_id],
    );
    for (const r of trk.rows) {
      const t = (r.tracking_number_raw || '').trim();
      if (t) trackingNumbers.push(t);
    }
  }

  return {
    kind: 'order',
    orderId: orderRow.id,
    orderNumber: orderRow.order_id,
    shipmentId: orderRow.shipment_id,
    serialUnitIds,
    serials,
    trackingNumbers,
  };
}

/**
 * Resolve the searched entity → org-gated anchors, or null (→ 404). Never reveals
 * cross-tenant existence: an order/tracking owned by another org resolves to null.
 */
export async function resolveEntity(
  client: PoolClient,
  orgId: OrgId,
  dim: JourneyDimension,
  value: string,
): Promise<EntityAnchors | null> {
  const v = value.trim();
  if (!v) return null;

  if (dim === 'order') {
    const numericId = /^[0-9]+$/.test(v) ? Number(v) : null;
    const res = await client.query<{ id: number; order_id: string | null; shipment_id: number | null }>(
      `SELECT id, order_id, shipment_id
         FROM orders
        WHERE organization_id = $1 AND (($2::int IS NOT NULL AND id = $2::int) OR order_id = $3)
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1`,
      [orgId, numericId, v],
    );
    if (res.rows.length === 0) return null;
    return resolveOrderAnchors(client, orgId, res.rows[0]);
  }

  if (dim === 'serial' || dim === 'unit') {
    let serialUnitId: number;
    let serialNumber: string;

    if (dim === 'unit') {
      if (!/^[0-9]+$/.test(v)) return null;
      const byId = await client.query<{ id: number; serial_number: string }>(
        `SELECT id, serial_number FROM serial_units
          WHERE organization_id = $1 AND id = $2::int
          LIMIT 1`,
        [orgId, Number(v)],
      );
      if (byId.rows.length === 0) return null;
      serialUnitId = Number(byId.rows[0].id);
      serialNumber = byId.rows[0].serial_number;
    } else {
      const normalized = normalizeSerial(v);
      const res = await client.query<{ id: number; serial_number: string }>(
        `SELECT id, serial_number FROM serial_units
          WHERE organization_id = $1 AND normalized_serial = $2
          LIMIT 1`,
        [orgId, normalized],
      );
      if (res.rows.length === 0) return null;
      serialUnitId = Number(res.rows[0].id);
      serialNumber = res.rows[0].serial_number;
    }

    const ord = await client.query<{ id: number; order_id: string | null; shipment_id: number | null }>(
      `SELECT o.id, o.order_id, o.shipment_id
         FROM order_unit_allocations oua
         JOIN orders o ON o.id = oua.order_id AND o.organization_id = $2
        WHERE oua.serial_unit_id = $1 AND oua.organization_id = $2
        ORDER BY oua.allocated_at DESC
        LIMIT 1`,
      [serialUnitId, orgId],
    );
    const order = ord.rows[0] ?? null;
    let trackingNumbers: string[] = [];
    if (order?.shipment_id != null) {
      const trk = await client.query<{ tracking_number_raw: string | null }>(
        `SELECT tracking_number_raw FROM shipping_tracking_numbers WHERE id = $1`,
        [order.shipment_id],
      );
      trackingNumbers = trk.rows.map((r) => (r.tracking_number_raw || '').trim()).filter(Boolean);
    }
    return {
      // URL may say dim=unit; anchors behave as a serial Trace for spines/UI.
      kind: 'serial',
      orderId: order?.id ?? null,
      orderNumber: order?.order_id ?? null,
      shipmentId: order?.shipment_id ?? null,
      serialUnitIds: [serialUnitId],
      serials: [serialNumber],
      trackingNumbers,
    };
  }

  // dim === 'tracking' — resolve via the OWNING org-owned order (carrier tables
  // are org-less). 404 if no org order references the shipment.
  const normalizedTracking = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const res = await client.query<{ id: number; order_id: string | null; shipment_id: number | null }>(
    `SELECT o.id, o.order_id, o.shipment_id
       FROM shipping_tracking_numbers stn
       JOIN orders o ON o.shipment_id = stn.id AND o.organization_id = $1
      WHERE stn.tracking_number_normalized = $2
      ORDER BY o.created_at DESC NULLS LAST
      LIMIT 1`,
    [orgId, normalizedTracking],
  );
  if (res.rows.length === 0) return null;
  const anchors = await resolveOrderAnchors(client, orgId, res.rows[0]);
  return { ...anchors, kind: 'tracking' };
}

/**
 * Per-serial provenance (SKU · grade · status · originating PO) for the By-unit
 * band headers. Org-scoped on `serial_units`; a unit received off-PO simply
 * yields `poNumber: null`. Empty input → empty result (no query).
 *
 * The PO joins via each unit's CURRENT receiving line — its most recent
 * inventory_events touch, falling back to the frozen `origin_receiving_line_id`
 * — NOT `origin_receiving_line_id` alone. That column COALESCE-freezes to the
 * FIRST-ever receiving line on attach and never advances, so a unit that
 * shipped, was returned, and got re-received under a different PO/carton kept
 * showing its original (now stale) PO here forever. Mirrors
 * `resolveCurrentReceivingLineIds` (src/lib/neon/serial-units-queries.ts).
 */
export async function readSerialProvenance(
  client: PoolClient,
  orgId: OrgId,
  serialUnitIds: number[],
): Promise<SerialProvenance[]> {
  if (serialUnitIds.length === 0) return [];
  const res = await client.query<{
    serial_unit_id: number;
    serial_number: string | null;
    sku: string | null;
    condition_grade: string | null;
    current_status: string | null;
    po_number: string | null;
  }>(
    `WITH current_line AS (
       SELECT DISTINCT ON (ie.serial_unit_id)
              ie.serial_unit_id, ie.receiving_line_id
         FROM inventory_events ie
        WHERE ie.serial_unit_id = ANY($2::int[])
          AND ie.receiving_line_id IS NOT NULL
          AND ie.organization_id = $1
        ORDER BY ie.serial_unit_id, ie.occurred_at DESC, ie.id DESC
     )
     SELECT su.id AS serial_unit_id,
            su.serial_number,
            su.sku,
            su.condition_grade,
            su.current_status,
            rz.zoho_purchaseorder_number AS po_number
       FROM serial_units su
       JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id
       LEFT JOIN current_line cl ON cl.serial_unit_id = su.id
       LEFT JOIN receiving_line rl
         ON rl.id = COALESCE(cl.receiving_line_id, vo.origin_receiving_line_id)
        AND rl.organization_id = su.organization_id
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
      WHERE su.organization_id = $1
        AND su.id = ANY($2::int[])`,
    [orgId, serialUnitIds],
  );
  return res.rows.map((r) => ({
    serialUnitId: Number(r.serial_unit_id),
    serial: (r.serial_number || '').trim(),
    sku: r.sku,
    grade: r.condition_grade,
    status: r.current_status,
    poNumber: (r.po_number || '').trim() || null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity mode — fan out indexed point-lookups, merge in JS
// ─────────────────────────────────────────────────────────────────────────────

function groupForAnchors(
  anchors: EntityAnchors,
  over: { serialNumber?: string | null; trackingNumber?: string | null; station?: string | null },
) {
  return {
    orderId: anchors.orderId,
    orderNumber: anchors.orderNumber,
    serialNumber: over.serialNumber ?? anchors.serials[0] ?? null,
    trackingNumber: over.trackingNumber ?? anchors.trackingNumbers[0] ?? null,
    station: over.station ?? null,
  };
}

export async function readJourneyEntity(
  client: PoolClient,
  orgId: OrgId,
  anchors: EntityAnchors,
  filters: JourneyFilters,
  deps: JourneyDeps = defaultDeps,
): Promise<JourneyEvent[]> {
  const { from, to } = windowBounds(filters, ENTITY_WINDOW_MS);
  const sources = resolveSources(filters);
  const limit = clampLimit(filters.limit);
  const want = (s: JourneySource) => sources.includes(s);
  const out: JourneyEvent[] = [];

  // 1) SAL — all stations (the journey wants PACK/SHIP, not just TECH/OUTBOUND).
  if (want('sal') && anchors.shipmentId != null) {
    const stationFilter = filters.stations?.length ? mapStationsToSpines(filters.stations).sal : null;
    const typeFilter = filters.types?.length ? filters.types : null;
    const sal = await client.query<StationActivityRow>(
      `SELECT sal.id, sal.created_at, sal.station, sal.activity_type, s.name AS actor_name,
              sal.scan_ref, sal.tech_serial_number_id,
              COALESCE(NULLIF(BTRIM(tsn.serial_number), ''), NULLIF(BTRIM(sal.metadata->>'serial'), '')) AS serial_number,
              tsn.serial_type, sal.metadata
         FROM station_activity_logs sal
         LEFT JOIN staff s ON s.id = sal.staff_id AND s.organization_id = sal.organization_id
         LEFT JOIN tech_serial_numbers tsn ON tsn.id = sal.tech_serial_number_id AND tsn.organization_id = sal.organization_id
        WHERE sal.organization_id = $1
          AND (sal.shipment_id = $2 OR (sal.activity_type = 'SERIAL_ADDED' AND tsn.shipment_id = $2))
          AND sal.created_at >= $3 AND sal.created_at < $4
          AND ($5::text[] IS NULL OR sal.station = ANY($5::text[]))
          AND ($6::text[] IS NULL OR sal.activity_type = ANY($6::text[]))
        ORDER BY sal.created_at DESC, sal.id DESC
        LIMIT $7`,
      [orgId, anchors.shipmentId, from, to, stationFilter, typeFilter, limit],
    );
    for (const r of sal.rows) {
      const raw: StationActivityRow = {
        id: r.id,
        created_at: r.created_at,
        station: r.station,
        activity_type: r.activity_type,
        actor_name: r.actor_name,
        scan_ref: r.scan_ref,
        tech_serial_number_id: r.tech_serial_number_id,
        serial_number: r.serial_number,
        serial_type: r.serial_type,
        metadata: r.metadata,
      };
      out.push({
        source: 'sal',
        id: `sal:${r.id}`,
        at: r.created_at,
        group: groupForAnchors(anchors, { serialNumber: r.serial_number, station: r.station }),
        raw,
      });
    }
  }

  // 2) inventory_events — the unit lifecycle (reuse the shared spine reader).
  if (want('inventory') && anchors.serialUnitIds.length > 0) {
    const spine = await deps.readInventorySpine(
      {
        serialUnitIds: anchors.serialUnitIds,
        order: 'desc',
        limit,
        eventTypes: filters.types?.length ? filters.types : undefined,
      },
      orgId,
    );
    for (const r of spine) {
      const raw: InventoryTimelineRow = {
        id: r.id,
        occurred_at: r.occurred_at,
        event_type: r.event_type,
        actor_name: r.actor_name,
        serial_number: r.serial_number,
        sku: r.sku,
        prev_status: r.prev_status,
        next_status: r.next_status,
        bin_barcode: r.bin_barcode,
        bin_name: r.bin_name,
        payload: r.payload,
      };
      out.push({
        source: 'inventory',
        id: `inv:${r.id}`,
        at: r.occurred_at,
        group: groupForAnchors(anchors, { serialNumber: r.serial_number, station: r.station }),
        raw,
      });
    }
  }

  // 3) audit_logs — order-anchored edits.
  if (want('audit') && anchors.orderId != null) {
    const audit = await client.query<OrderAuditRow>(
      `SELECT al.id, al.created_at, al.action, al.before_data, al.after_data, al.metadata, s.name AS actor_name
         FROM audit_logs al
         LEFT JOIN staff s ON s.id = al.actor_staff_id
        WHERE lower(al.entity_type) = 'order' AND al.entity_id = $1 AND al.organization_id = $2
          AND al.created_at >= $3 AND al.created_at < $4
        ORDER BY al.created_at DESC
        LIMIT $5`,
      [String(anchors.orderId), orgId, from, to, limit],
    );
    for (const r of audit.rows) {
      out.push({
        source: 'audit',
        id: `audit:${r.id}`,
        at: r.created_at,
        group: groupForAnchors(anchors, { station: null }),
        raw: r,
      });
    }
  }

  // 4) carrier — org-gated via the order's shipment (carrier table is org-less).
  if (want('carrier') && anchors.shipmentId != null) {
    const carrier = await client.query<CarrierEvent>(
      `SELECT e.id, e.event_occurred_at, e.normalized_status_category, e.external_status_label,
              e.external_status_description, e.event_city, e.event_state,
              e.exception_description, e.signed_by
         FROM shipment_tracking_events e
        WHERE e.shipment_id = $1
          AND (e.event_occurred_at IS NULL OR (e.event_occurred_at >= $2 AND e.event_occurred_at < $3))
        ORDER BY e.event_occurred_at DESC NULLS LAST, e.id DESC
        LIMIT $4`,
      [anchors.shipmentId, from, to, limit],
    );
    for (const r of carrier.rows) {
      out.push({
        source: 'carrier',
        id: `carrier:${r.id}`,
        at: r.event_occurred_at,
        group: groupForAnchors(anchors, { station: 'CARRIER' }),
        raw: r,
      });
    }
  }

  // 5) warranty — by order or by any of the entity's serial units.
  if (want('warranty') && (anchors.orderId != null || anchors.serialUnitIds.length > 0)) {
    const warranty = await client.query<{
      id: number;
      event_type: string;
      from_status: string | null;
      to_status: string | null;
      created_at: string | null;
      serial_number: string | null;
      actor_name: string | null;
    }>(
      `SELECT ev.id, ev.event_type, ev.from_status, ev.to_status, ev.created_at, wc.serial_number,
              s.name AS actor_name
         FROM warranty_claim_events ev
         JOIN warranty_claims wc ON wc.id = ev.claim_id AND wc.organization_id = ev.organization_id AND wc.deleted_at IS NULL
         LEFT JOIN staff s ON s.id = ev.actor_staff_id AND s.organization_id = ev.organization_id
        WHERE ev.organization_id = $1
          AND (($2::int IS NOT NULL AND wc.order_id = $2::int) OR wc.serial_unit_id = ANY($3::int[]))
          AND ev.created_at >= $4 AND ev.created_at < $5
        ORDER BY ev.created_at DESC
        LIMIT $6`,
      [orgId, anchors.orderId, anchors.serialUnitIds, from, to, limit],
    );
    for (const r of warranty.rows) {
      const raw: WarrantyEventRow = {
        id: r.id,
        eventType: r.event_type,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        createdAt: r.created_at,
        actorName: r.actor_name,
      };
      out.push({
        source: 'warranty',
        id: `warranty:${r.id}`,
        at: r.created_at,
        group: groupForAnchors(anchors, { serialNumber: r.serial_number, station: 'WARRANTY' }),
        raw,
      });
    }
  }

  // 6) thread — conversation messages anchored to the order or its serial
  //    units (entity_threads/thread_messages; indexed point lookup, org-gated).
  if (want('thread') && (anchors.orderId != null || anchors.serialUnitIds.length > 0)) {
    const thread = await client.query<{
      id: number;
      visibility: string;
      provider: string;
      body: string;
      created_at: string | null;
      author_name: string | null;
      serial_number: string | null;
    }>(
      `SELECT tm.id, tm.visibility, tm.provider, tm.body, tm.created_at,
              s.name AS author_name, su.serial_number
         FROM thread_messages tm
         JOIN entity_threads et ON et.id = tm.thread_id AND et.organization_id = tm.organization_id
         LEFT JOIN staff s ON s.id = tm.author_staff_id AND s.organization_id = tm.organization_id
         LEFT JOIN serial_units su
                ON et.entity_type = 'SERIAL_UNIT' AND su.id = et.entity_id AND su.organization_id = et.organization_id
        WHERE tm.organization_id = $1
          AND (
            ($2::bigint IS NOT NULL AND et.entity_type = 'ORDER' AND et.entity_id = $2::bigint)
            OR (et.entity_type = 'SERIAL_UNIT' AND et.entity_id = ANY($3::bigint[]))
          )
          AND tm.created_at >= $4 AND tm.created_at < $5
        ORDER BY tm.created_at DESC, tm.id DESC
        LIMIT $6`,
      [orgId, anchors.orderId, anchors.serialUnitIds, from, to, limit],
    );
    for (const r of thread.rows) {
      const raw: ThreadMessageTimelineRow = {
        id: r.id,
        visibility: r.visibility,
        provider: r.provider,
        body: r.body,
        createdAt: r.created_at,
        authorName: r.author_name,
      };
      out.push({
        source: 'thread',
        id: `thread:${r.id}`,
        at: r.created_at,
        group: groupForAnchors(anchors, { serialNumber: r.serial_number, station: null }),
        raw,
      });
    }
  }

  // 7) ticket — SHIPMENT ticket link/unlink ops_events + SERIAL_UNIT ticket_links.
  //    Entity mode only (no browse arm). Reuses Support Context Hub query shapes.
  if (
    want('ticket') &&
    (anchors.shipmentId != null || anchors.serialUnitIds.length > 0)
  ) {
    if (anchors.shipmentId != null) {
      const shipTickets = await client.query<{
        id: string;
        occurred_at: string;
        event_type: string;
        payload: { zendeskTicketId?: number } | null;
        actor_name: string | null;
      }>(
        `SELECT oe.id::text AS id, oe.occurred_at, oe.event_type, oe.payload,
                s.name AS actor_name
           FROM ops_events oe
           LEFT JOIN staff s ON s.id = oe.actor_staff_id AND s.organization_id = oe.organization_id
          WHERE oe.organization_id = $1
            AND lower(oe.entity_type) = 'shipment'
            AND oe.entity_id = $2
            AND oe.event_type IN ('TICKET_LINKED', 'TICKET_UNLINKED')
            AND oe.occurred_at >= $3 AND oe.occurred_at < $4
          ORDER BY oe.occurred_at DESC
          LIMIT $5`,
        [orgId, anchors.shipmentId, from, to, limit],
      );
      for (const r of shipTickets.rows) {
        const zid = r.payload?.zendeskTicketId ?? null;
        const label = zid != null ? `#${zid}` : '#—';
        const raw: TicketLinkTimelineRow = {
          id: `ops:${r.id}`,
          at: r.occurred_at,
          kind: r.event_type === 'TICKET_UNLINKED' ? 'unlinked' : 'linked',
          ticketLabel: label,
          actorName: r.actor_name,
          href: zendeskTicketUrl(zid),
        };
        out.push({
          source: 'ticket',
          id: `ticket:${raw.id}`,
          at: r.occurred_at,
          group: groupForAnchors(anchors, { station: 'SUPPORT' }),
          raw,
        });
      }
    }

    if (anchors.serialUnitIds.length > 0) {
      const unitTickets = await client.query<{
        id: number;
        created_at: string | null;
        zendesk_ticket_id: string | null;
        actor_name: string | null;
        serial_number: string | null;
      }>(
        `SELECT tl.id, tl.created_at, tl.zendesk_ticket_id, s.name AS actor_name,
                su.serial_number
           FROM ticket_links tl
           LEFT JOIN staff s ON s.id = tl.created_by AND s.organization_id = tl.organization_id
           LEFT JOIN serial_units su ON su.id = tl.entity_id AND su.organization_id = tl.organization_id
          WHERE tl.organization_id = $1
            AND tl.entity_type = 'SERIAL_UNIT'
            AND tl.entity_id = ANY($2::bigint[])
            AND tl.created_at >= $3 AND tl.created_at < $4
          ORDER BY tl.created_at DESC
          LIMIT $5`,
        [orgId, anchors.serialUnitIds, from, to, limit],
      );
      for (const r of unitTickets.rows) {
        const label = r.zendesk_ticket_id ? `#${r.zendesk_ticket_id}` : '#—';
        const raw: TicketLinkTimelineRow = {
          id: r.id,
          at: r.created_at,
          kind: 'linked',
          ticketLabel: label,
          actorName: r.actor_name,
          href: zendeskTicketUrl(r.zendesk_ticket_id),
        };
        out.push({
          source: 'ticket',
          id: `ticket:${r.id}`,
          at: r.created_at,
          group: groupForAnchors(anchors, {
            serialNumber: r.serial_number,
            station: 'SUPPORT',
          }),
          raw,
        });
      }
    }
  }

  return sortJourneyDesc(out).slice(0, MAX_LIMIT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse mode — keyset-paginated UNION ALL
// ─────────────────────────────────────────────────────────────────────────────

export async function readJourneyBrowse(
  client: PoolClient,
  orgId: OrgId,
  filters: JourneyFilters,
  cursor: JourneyCursor | null,
): Promise<JourneyBrowseResult> {
  const { sql, params, limit } = buildBrowseQuery(orgId, filters, cursor);
  const res = await client.query<BrowseRow>(sql, params as unknown[]);

  const rows = res.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events: JourneyEvent[] = page.map((r) => {
    const idNum = Number(r.id_num);
    return {
      source: r.source,
      id: `${SOURCE_PREFIX[r.source]}:${idNum}`,
      at: r.at,
      group: {
        orderId: r.order_id == null ? null : Number(r.order_id),
        orderNumber: r.order_number,
        serialNumber: r.serial_number,
        trackingNumber: r.tracking_number,
        station: r.station,
      },
      raw: r.raw,
    };
  });

  let nextCursor: JourneyCursor | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    if (last.at) {
      nextCursor = { at: last.at, source: last.source, id: Number(last.id_num) };
    }
  }

  return { events, nextCursor };
}
