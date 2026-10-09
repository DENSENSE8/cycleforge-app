import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { readInventorySpine, type InventoryEventRecord } from '@/lib/audit-log/inventory-spine';
import {
  listOrderPackerTimelinePhotos,
  listUnitTimelinePhotos,
  type UnitTimelinePhoto,
} from '@/lib/photos/queries/unit-timeline-photos';
import { listShipmentCarrierEvents } from '@/lib/shipments/carrier-events';
import { ORDER_PO_LINKS_SQL, toOrderPoLinks } from '@/lib/orders/po-order-link';
import { ORDER_RETURNS_SQL, toOrderReturns } from '@/lib/orders/order-returns';

/** GET /api/orders/[id]/timeline — the order's event trail, newest first. */

/** Photo-spine fan-out cap: enough for every real order, bounded for bulk ones. */
const PHOTO_SPINE_UNIT_CAP = 20;

const LOG_PREFIX = '[GET /api/orders/[id]/timeline]';

/** Unit lifecycle rows plus the pick/pack payload-spine fallback rows. */
type LifecycleRow = InventoryEventRecord | QueryResultRow;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function messageOf(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/**
 * A side spine that must never take down the record's timeline: its rows, or
 * [] on failure. 42P01 = undefined_table (migration not yet applied) degrades
 * silently; anything else is logged.
 */
async function degradeSpine<T>(label: string, load: Promise<{ rows: T[] }>): Promise<T[]> {
  try {
    return (await load).rows;
  } catch (err: unknown) {
    if (!(err instanceof Error && 'code' in err && err.code === '42P01')) {
      console.warn(`${LOG_PREFIX} ${label} spine degraded:`, messageOf(err));
    }
    return [];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const orgId = gate.ctx.organizationId;
    // Field-level audit diffs are admin-only (Operations History §3.2 Option B).
    // We select `before_data` conditionally rather than nulling it after the
    // fact so a non-admin's snapshot never enters this process's memory.
    const canViewAudit = gate.ctx.permissions.has('admin.view_logs');

    // Every read is one GUC-scoped (`app.current_org`) round trip on its own
    // pooled connection, so independent trails overlap instead of queuing
    // BEGIN/set_config/query/COMMIT behind each other on one client. Each
    // statement also carries its own organization_id predicate.
    const read = <T extends QueryResultRow = QueryResultRow>(sql: string, sqlParams: unknown[]) =>
      tenantQueryOneTrip<T>(orgId, sql, sqlParams);

    // Tenant ownership pre-flight. Trails keyed on the shipment / marketplace
    // order id wait for it; nothing is returned unless it passes.
    const shipmentTrails = read<{
      organization_id: string | null;
      shipment_id: number | null;
      order_id: string | null;
    }>(
      `SELECT organization_id, shipment_id, order_id FROM orders WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    ).then(async (owner) => {
      if (owner.rows.length === 0 || owner.rows[0].organization_id !== orgId) {
        return { notFound: true as const };
      }
      const shipmentId = owner.rows[0].shipment_id;
      const marketplaceOrderId = String(owner.rows[0].order_id ?? '').trim();

      // Tech verdict lives on the unit, not the order. Resolve the order's
      // allocated units, then (dependent) their lifecycle + photo spines.
      const unitTrails = read<{ serial_unit_id: number }>(
        `SELECT DISTINCT serial_unit_id FROM (
            SELECT oua.serial_unit_id
              FROM order_unit_allocations oua
             WHERE oua.order_id = $1
               AND oua.organization_id = $2
               AND oua.serial_unit_id IS NOT NULL
            UNION
            SELECT tsn.serial_unit_id
              FROM tech_serial_numbers tsn
             WHERE tsn.serial_unit_id IS NOT NULL
               AND (
                 tsn.order_id = $1
                 OR (
                   $3::bigint IS NOT NULL
                   AND tsn.shipment_id = $3
                   AND NOT EXISTS (
                     SELECT 1 FROM orders o2
                      WHERE o2.shipment_id = $3
                        AND o2.organization_id = $2
                        AND o2.id <> $1
                   )
                 )
               )
          ) units
          LIMIT 200`,
        [id, orgId, shipmentId],
      ).then(async (alloc): Promise<{ lifecycle: LifecycleRow[]; unitPhotos: UnitTimelinePhoto[] }> => {
        const serialUnitIds = alloc.rows
          .map((r) => Number(r.serial_unit_id))
          .filter(Number.isFinite);
        if (serialUnitIds.length === 0) {
          return { lifecycle: [], unitPhotos: [] };
        }
        const [lifecycle, unitPhotos] = await Promise.all([
          // Pull the FULL unit lifecycle for the order's allocated serials (not just TEST_* verdicts), so the order timeline is the per-unit…
          readInventorySpine(
            {
              serialUnitIds,
              order: 'desc',
              limit: 200,
            },
            orgId,
          ),
          // Photo evidence spine — the stage photo buckets per allocated unit, flat (each row carries the unit's serial from the query's…
          Promise.all(
            serialUnitIds
              .slice(0, PHOTO_SPINE_UNIT_CAP)
              .map((unitId) => listUnitTimelinePhotos(orgId, unitId)),
          ).then(
            (lists) => lists.flat(),
            (photoErr: unknown) => {
              console.warn(`${LOG_PREFIX} photo spine degraded:`, messageOf(photoErr));
              return [] as UnitTimelinePhoto[];
            },
          ),
        ]);
        return { lifecycle, unitPhotos };
      });

      const [units, stationEvents, packEvents, packerLogs, payloadSpine, carrierEvents] = await Promise.all([
        unitTrails,
        shipmentId != null
          ? read(
              `SELECT sal.id, sal.created_at, sal.station, sal.activity_type, sal.scan_ref,
                      sal.tech_serial_number_id, sal.metadata,
                      COALESCE(
                        NULLIF(BTRIM(tsn.serial_number), ''),
                        NULLIF(BTRIM(sal.metadata->>'serial'), '')
                      ) AS serial_number,
                      tsn.serial_type,
                      s.name AS actor_name, sal.staff_id AS actor_staff_id
                 FROM station_activity_logs sal
                 LEFT JOIN staff s ON s.id = sal.staff_id
                 LEFT JOIN tech_serial_numbers tsn
                   ON tsn.id = sal.tech_serial_number_id
                  AND tsn.organization_id = $3
                WHERE sal.organization_id = $3
                  AND (
                    sal.shipment_id = $1
                    OR (
                      sal.activity_type = 'SERIAL_ADDED'
                      AND tsn.shipment_id = $1
                    )
                  )
                  AND sal.station = ANY($2::text[])
                ORDER BY sal.created_at DESC, sal.id DESC
                LIMIT 200`,
              [shipmentId, ['TECH', 'PICK', 'OUTBOUND'], orgId],
            )
          : { rows: [] as QueryResultRow[] },
        read(
          `SELECT sal.id, sal.created_at, sal.station, sal.activity_type, sal.scan_ref,
                  sal.tech_serial_number_id, sal.metadata,
                  COALESCE(
                    NULLIF(BTRIM(tsn.serial_number), ''),
                    NULLIF(BTRIM(sal.metadata->>'serial'), '')
                  ) AS serial_number,
                  tsn.serial_type,
                  s.name AS actor_name, sal.staff_id AS actor_staff_id
             FROM station_activity_logs sal
             LEFT JOIN staff s ON s.id = sal.staff_id
             LEFT JOIN tech_serial_numbers tsn
               ON tsn.id = sal.tech_serial_number_id
            WHERE sal.organization_id = $2
              AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
              AND (
                ($3::bigint IS NOT NULL AND sal.shipment_id = $3)
                OR sal.order_row_id = $1
                OR ($4 <> '' AND sal.ext_order_id = $4)
              )
            ORDER BY sal.created_at DESC, sal.id DESC
            LIMIT 200`,
          [id, orgId, shipmentId, marketplaceOrderId],
        ),
        shipmentId != null
          ? read(
              `SELECT pl.id, pl.created_at, 'PACK'::text AS station,
                      'PACK_COMPLETED'::text AS activity_type,
                      COALESCE(stn.tracking_number_raw, pl.scan_ref) AS scan_ref,
                      NULL::int AS tech_serial_number_id,
                      NULL::jsonb AS metadata,
                      NULL::text AS serial_number,
                      NULL::text AS serial_type,
                      s.name AS actor_name, pl.packed_by AS actor_staff_id
                 FROM packer_logs pl
                 LEFT JOIN shipping_tracking_numbers stn ON stn.id = pl.shipment_id
                 LEFT JOIN staff s ON s.id = pl.packed_by
                WHERE pl.organization_id = $2
                  AND pl.shipment_id = $1
                  AND pl.completion_state = 'COMPLETED'
                ORDER BY pl.created_at DESC, pl.id DESC
                LIMIT 50`,
              [shipmentId, orgId],
            )
          : { rows: [] as QueryResultRow[] },
        // Pick/pack payload spine — only used when the unit lifecycle carries
        // no PICKED/PACKED row, but fetched alongside it (not after) so the
        // fallback never adds a round trip. Settled here, judged below.
        read(
          `SELECT ie.id, ie.occurred_at, ie.event_type, ie.notes, ie.prev_status, ie.next_status,
                  ie.station, s.name AS actor_name, su.serial_number, ie.sku,
                  NULL::text AS bin_name, NULL::text AS bin_barcode
             FROM inventory_events ie
             LEFT JOIN staff s ON s.id = ie.actor_staff_id
             LEFT JOIN serial_units su ON su.id = ie.serial_unit_id
            WHERE ie.organization_id = $1
              AND ie.event_type IN ('PICKED', 'PACKED')
              AND (
                ($3 <> '' AND ie.payload->>'order_id' = $3)
                OR (
                  (ie.payload->>'order_row_id') ~ '^[0-9]+$'
                  AND (ie.payload->>'order_row_id')::int = $2
                )
              )
            ORDER BY ie.occurred_at DESC
            LIMIT 100`,
          [orgId, id, marketplaceOrderId],
        ).then(
          (res) => ({ ok: true as const, rows: res.rows }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        // Carrier spine — the shipment's physical scan trail.
        shipmentId != null
          ? listShipmentCarrierEvents(shipmentId).catch((carrierErr: unknown) => {
              console.warn(`${LOG_PREFIX} carrier spine degraded:`, messageOf(carrierErr));
              return [] as unknown[];
            })
          : ([] as unknown[]),
      ]);

      return {
        notFound: false as const,
        units,
        stationEvents,
        packEvents,
        packerLogs,
        payloadSpine,
        carrierEvents,
      };
    });

    // Trails keyed only on the order id start with the pre-flight; each is
    // org-predicated and discarded on a 404.
    const [shipment, result, pickSessions, packerPhotos, threadMessages, rmaEvents, orderNotes, signals, poLinkRows, returnRows] =
      await Promise.all([
        shipmentTrails,
        read(
          `SELECT al.id, al.created_at, al.action, al.after_data, al.metadata,
                  ${canViewAudit ? 'al.before_data' : 'NULL::jsonb AS before_data'},
                  s.name AS actor_name, al.actor_staff_id
             FROM audit_logs al
             LEFT JOIN staff s ON s.id = al.actor_staff_id
            WHERE lower(al.entity_type) = 'order' AND al.entity_id = $1
              AND al.organization_id = $2
            ORDER BY al.created_at DESC
            LIMIT 200`,
          [String(id), orgId],
        ),
        read(
          `SELECT ps.id, ps.ended_at, s.name AS actor_name
             FROM picking_sessions ps
             JOIN orders o ON o.id = ps.order_id AND o.organization_id = $2
             LEFT JOIN staff s ON s.id = ps.picker_staff_id
            WHERE ps.order_id = $1
              AND ps.ended_at IS NOT NULL
              AND COALESCE(ps.abandoned, FALSE) = FALSE
            ORDER BY ps.ended_at DESC
            LIMIT 50`,
          [id, orgId],
        ),
        listOrderPackerTimelinePhotos(orgId, id),
        // Thread spine — entity-anchored conversation messages (THREAD_MESSAGE) for this order surface as read rows on the merged history (D4).
        degradeSpine(
          'thread',
          read(
            `SELECT tm.id, tm.created_at AS "createdAt", tm.body, tm.visibility, tm.provider,
                    s.name AS "authorName"
               FROM thread_messages tm
               JOIN entity_threads et ON et.id = tm.thread_id
               LEFT JOIN staff s ON s.id = tm.author_staff_id
              WHERE et.organization_id = $1
                AND et.entity_type = 'ORDER'
                AND et.entity_id = $2
                AND tm.organization_id = $1
              ORDER BY tm.created_at DESC
              LIMIT 200`,
            [orgId, id],
          ),
        ),
        // RMA spine — returns/RTV authorized against this order. Org-scoped
        // (`rma_authorizations` is NOT NULL + FORCE RLS since 2026-06-22g).
        degradeSpine(
          'rma',
          read(
            `SELECT r.id, r.rma_number, r.direction, r.status,
                    r.authorized_at, r.closed_at, r.expected_carrier, r.notes,
                    s.name AS actor_name
               FROM rma_authorizations r
               LEFT JOIN staff s ON s.id = r.created_by_staff_id
              WHERE r.order_id = $1
                AND r.organization_id = $2
              ORDER BY r.authorized_at DESC
              LIMIT 50`,
            [id, orgId],
          ),
        ),
        // Notes spine — the `order_notes` TABLE.
        degradeSpine(
          'notes',
          read(
            `SELECT n.id, n.note_text AS "noteText", n.created_at AS "createdAt",
                    s.name AS "authorName"
               FROM order_notes n
               LEFT JOIN staff s ON s.id = n.author_staff_id
              WHERE n.organization_id = $1
                AND n.order_id = $2
              ORDER BY n.created_at DESC
              LIMIT 100`,
            [orgId, id],
          ),
        ),
        // Signal spine — `entity_signals` is the "why" record (signal_kind, reason_code, severity, notes).
        degradeSpine(
          'signal',
          read(
            `SELECT es.id, es.signal_kind AS "signalKind", es.reason_code AS "reasonCode",
                    es.severity, es.notes, es.occurred_at AS "occurredAt"
               FROM entity_signals es
              WHERE es.organization_id = $1
                AND es.entity_type = 'ORDER'
                AND es.entity_id = $2
              ORDER BY es.occurred_at DESC
              LIMIT 100`,
            [orgId, id],
          ),
        ),
        // PO ↔ order edge — the purchase orders bought for this order (`receiving_order_link`).
        degradeSpine('po-links', read(ORDER_PO_LINKS_SQL, [orgId, id])),
        // Returns filed against this order — the record's return reason above Fulfillment.
        degradeSpine('returns', read(ORDER_RETURNS_SQL, [orgId, id])),
      ]);

    if (shipment.notFound) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const { units, stationEvents, packEvents, packerLogs, payloadSpine, carrierEvents } = shipment;

    let lifecycle = units.lifecycle;
    const hasPickOrPackLifecycle = lifecycle.some((row) => {
      const type = String(row.event_type ?? '').trim();
      return type === 'PICKED' || type === 'PACKED';
    });
    if (!hasPickOrPackLifecycle) {
      if (payloadSpine.ok) {
        lifecycle = [...lifecycle, ...payloadSpine.rows];
      } else {
        console.warn(`${LOG_PREFIX} pick/pack payload spine degraded:`, messageOf(payloadSpine.error));
      }
    }

    const packEventRows =
      packEvents.rows.length > 0 ? packEvents.rows : packerLogs.rows;

    const seenPhotoIds = new Set<number>();
    const unitPhotos = units.unitPhotos.filter((photo) => {
      if (seenPhotoIds.has(photo.photoId)) return false;
      seenPhotoIds.add(photo.photoId);
      return true;
    });
    for (const photo of packerPhotos) {
      if (seenPhotoIds.has(photo.photoId)) continue;
      seenPhotoIds.add(photo.photoId);
      unitPhotos.push(photo);
    }

    return NextResponse.json({
      success: true,
      events: result.rows,
      lifecycle,
      stationEvents: stationEvents.rows,
      threadMessages,
      orderNotes,
      signals,
      carrierEvents,
      rmaEvents,
      unitPhotos,
      pickSessions: pickSessions.rows,
      packEvents: packEventRows,
      poLinks: toOrderPoLinks(poLinkRows),
      returns: toOrderReturns(returnRows),
    });
  } catch (error: unknown) {
    console.error(`${LOG_PREFIX} error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch order timeline', details: messageOf(error) },
      { status: 500 },
    );
  }
}
