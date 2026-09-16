import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { readInventorySpine } from '@/lib/audit-log/inventory-spine';
import {
  listUnitTimelinePhotos,
  type UnitTimelinePhoto,
} from '@/lib/photos/queries/unit-timeline-photos';

/**
 * GET /api/orders/[id]/timeline — the order's event trail, newest first.
 * Feeds the shared `EventTimeline` in the order details panel.
 *
 * Spines, merged client-side in `OrderTimelineSection`:
 *   • `events`    — order-anchored `audit_logs` (tracking added, label printed,
 *                   packed, shipped, edits…). Matches `lower(entity_type)='order'`
 *                   since callers historically wrote the uppercase 'ORDER' literal
 *                   while AUDIT_ENTITY.ORDER is 'order'.
 *                   `before_data` ships ONLY to `admin.view_logs` holders — the
 *                   client's `diffChanges` needs BOTH snapshots, so withholding
 *                   `before` is what suppresses the field-level diff for everyone
 *                   else while still showing that an edit happened.
 *   • `carrier`   — `shipment_tracking_events` for the order's shipment (Week 2).
 *                   The physical scan trail: accepted → in transit → out for
 *                   delivery → delivered/exception. Previously the record showed
 *                   only a single latest-status badge and none of the history.
 *   • `rma`       — `rma_authorizations` for this order: authorized / received /
 *                   dispositioned / closed. FK'd to `orders(id)` since 2026-05-23
 *                   and read by nothing until now.
 *   • `lifecycle` — the tech VERDICT, which is unit-anchored (not order-anchored),
 *                   so it never lands in the order's audit feed. We resolve the
 *                   order's allocated serial units → their `inventory_events`
 *                   TEST_* rows so "tested" shows on the order timeline too.
 *   • `stationEvents` — SAL (`station_activity_logs`) keyed by `shipment_id`.
 *                   SAL is the complete operational scan ledger; an order's
 *                   `audit_logs` feed is frequently incomplete (often only
 *                   PACK_COMPLETED), so the TECH scan + SHIP_CONFIRM live ONLY in
 *                   SAL. We pull TECH-station rows (the "tech scan" the panel was
 *                   missing) + OUTBOUND ship-out, excluding PACK (audit owns it,
 *                   avoiding a duplicate "Packed").
 *   • `unitPhotos` — the five-stage photo evidence rows (arrival / unbox carton /
 *                   unbox item / testing / packing — `UnitTimelinePhotoSource`)
 *                   for the order's allocated serial units, each row carrying
 *                   the unit's serial for client-side serial grouping. A failed
 *                   photo sub-fetch degrades to [] — it never 500s the timeline.
 *
 * Read-only; gated by `orders.view`.
 */

/** Photo-spine fan-out cap: enough for every real order, bounded for bulk ones. */
const PHOTO_SPINE_UNIT_CAP = 20;

type TimelineTx =
  | { notFound: true }
  | {
      notFound: false;
      result: { rows: unknown[] };
      alloc: { rows: Array<{ serial_unit_id: number }> };
      stationEvents: { rows: unknown[] };
      pickSessions: { rows: unknown[] };
      packEvents: { rows: unknown[] };
      packerLogs: { rows: unknown[] };
      shipmentId: number | null;
      marketplaceOrderId: string;
    };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
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

    // Tenant ownership pre-flight + the three independent trails run inside one
    // GUC-scoped transaction (`app.current_org`) so RLS can isolate these reads.
    // The trail queries key on the order id / shipment id alone; without org
    // scoping an authed caller in org A could read org B's audit +
    // inventory_events via a guessed order id. We 404 (not 403) so we don't
    // reveal that an order with that id exists in another tenant.
    const orgId = gate.ctx.organizationId;
    // Field-level audit diffs are admin-only (Operations History §3.2 Option B).
    // We select `before_data` conditionally rather than nulling it after the
    // fact so a non-admin's snapshot never enters this process's memory.
    const canViewAudit = gate.ctx.permissions.has('admin.view_logs');
    const txResult = await withTenantTransaction(orgId, async (client): Promise<TimelineTx> => {
      const owner = await client.query<{
        organization_id: string | null;
        shipment_id: number | null;
        order_id: string | null;
      }>(
        `SELECT organization_id, shipment_id, order_id FROM orders WHERE id = $1 AND organization_id = $2`,
        [id, orgId],
      );
      if (owner.rows.length === 0 || owner.rows[0].organization_id !== orgId) {
        return { notFound: true as const };
      }
      const shipmentId = owner.rows[0].shipment_id;
      const marketplaceOrderId = String(owner.rows[0].order_id ?? '').trim();

      // The three trails below are independent (they key on order id / shipment id,
      // not on each other), so fan them out in one round-trip group instead of
      // awaiting them serially — the panel's Timeline tab was slow precisely
      // because these stacked back-to-back on Neon. SAL always includes OUTBOUND
      // (the ship-out "Scanned out" w/ staff): the order audit feed is
      // order-anchored and the scan_out audit is shipment-anchored, so it never
      // double-counts here. PACK station stays excluded (audit_logs owns
      // PACK_COMPLETED, avoiding a duplicate "Packed").
      const [result, alloc, stationEvents, pickSessions, packEvents, packerLogs] = await Promise.all([
        client.query(
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
        // Tech verdict lives on the unit, not the order. Resolve the order's
        // allocated units so we can pull their TEST_* lifecycle rows below.
        client.query<{ serial_unit_id: number }>(
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
        ),
        shipmentId != null
          ? client.query(
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
              [shipmentId, ['TECH', 'OUTBOUND'], orgId],
            )
          : Promise.resolve({ rows: [] as any[] }),
        client.query(
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
        client.query(
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
                OR (
                  (sal.metadata->>'order_row_id') ~ '^[0-9]+$'
                  AND (sal.metadata->>'order_row_id')::int = $1
                )
                OR (
                  $4 <> ''
                  AND sal.metadata->>'order_id' IS NOT NULL
                  AND sal.metadata->>'order_id' = $4
                )
              )
            ORDER BY sal.created_at DESC, sal.id DESC
            LIMIT 200`,
          [id, orgId, shipmentId, marketplaceOrderId],
        ),
        shipmentId != null
          ? client.query(
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
                ORDER BY pl.created_at DESC, pl.id DESC
                LIMIT 50`,
              [shipmentId, orgId],
            )
          : Promise.resolve({ rows: [] as any[] }),
      ]);

      return {
        notFound: false as const,
        result,
        alloc,
        stationEvents,
        pickSessions,
        packEvents,
        packerLogs,
        shipmentId,
        marketplaceOrderId,
      };
    });

    if (txResult.notFound) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const {
      result,
      alloc,
      stationEvents,
      pickSessions,
      packEvents,
      packerLogs,
      shipmentId,
      marketplaceOrderId,
    } = txResult;

    // TEST_* spine needs the resolved unit ids from the allocation query above,
    // so it runs after that group resolves. Degrades to [] for orders with no
    // serialized allocations.
    const serialUnitIds = alloc.rows
      .map((r: { serial_unit_id: number }) => Number(r.serial_unit_id))
      .filter(Number.isFinite);
    // Pull the FULL unit lifecycle for the order's allocated serials (not just
    // TEST_* verdicts), so the order timeline is the per-unit chronological
    // history acceptance requires — receiving → test → putaway → pick → pack →
    // ship → return — keyed by order number. `inventoryEventsToTimeline`
    // already renders every type in this vocabulary; PACK/LABEL/SHIP rows that
    // also surface via `audit_logs`/SAL are de-duplicated client-side in
    // `OrderTimelineSection`. Org-scoped so a guessed order id can't leak a
    // foreign tenant's unit events.
    let lifecycle = serialUnitIds.length
      ? await readInventorySpine(
          {
            serialUnitIds,
            order: 'desc',
            limit: 200,
          },
          orgId,
        )
      : [];

    const hasPickOrPackLifecycle = lifecycle.some((row) => {
      const type = String(row.event_type ?? '').trim();
      return type === 'PICKED' || type === 'PACKED';
    });
    if (!hasPickOrPackLifecycle) {
      try {
        const payloadSpine = await withTenantTransaction(orgId, (client) =>
          client.query(
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
          ),
        );
        lifecycle = [...lifecycle, ...payloadSpine.rows];
      } catch (payloadErr: any) {
        console.warn('[GET /api/orders/[id]/timeline] pick/pack payload spine degraded:', payloadErr?.message);
      }
    }

    const packEventRows =
      packEvents.rows.length > 0 ? packEvents.rows : packerLogs.rows;

    // Photo evidence spine — the stage photo buckets per allocated unit, flat
    // (each row carries the unit's serial from the query's serial_units join,
    // so the client groups by serial without a second lookup). Capped fan-out;
    // degrade-not-fail: a photo failure never takes down the timeline.
    let unitPhotos: UnitTimelinePhoto[] = [];
    if (serialUnitIds.length > 0) {
      try {
        const lists = await Promise.all(
          serialUnitIds
            .slice(0, PHOTO_SPINE_UNIT_CAP)
            .map((unitId) => listUnitTimelinePhotos(orgId, unitId)),
        );
        unitPhotos = lists.flat();
      } catch (photoErr: any) {
        console.warn('[GET /api/orders/[id]/timeline] photo spine degraded:', photoErr?.message);
      }
    }

    // Thread spine — entity-anchored conversation messages (THREAD_MESSAGE) for
    // this order surface as read rows on the merged history (D4). Guarded: the
    // `entity_threads` / `thread_messages` pair may be UNAPPLIED in a given
    // environment, so a missing-relation error degrades this sub-resource to []
    // rather than 500-ing the whole (pre-existing) order timeline.
    let threadMessages: any[] = [];
    try {
      const threads = await withTenantTransaction(orgId, (client) =>
        client.query(
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
      );
      threadMessages = threads.rows;
    } catch (threadErr: any) {
      // 42P01 = undefined_table (migration not yet applied); anything else we
      // also swallow so conversation never takes down the record's timeline.
      if (threadErr?.code !== '42P01') {
        console.warn('[GET /api/orders/[id]/timeline] thread spine degraded:', threadErr?.message);
      }
    }

    // Carrier spine — the shipment's physical scan trail. `shipment_tracking_events`
    // is GLOBAL by design (no organization_id; a tracking number is carrier-global),
    // so tenant isolation rides on `shipmentId`, which came from the org-checked
    // order row above — never from the request. Degrades to [] on its own.
    let carrierEvents: any[] = [];
    if (shipmentId != null) {
      try {
        const carrier = await withTenantTransaction(orgId, (client) =>
          client.query(
            `SELECT id, event_occurred_at, normalized_status_category,
                    external_status_label, external_status_description,
                    event_city, event_state, exception_description, signed_by
               FROM shipment_tracking_events
              WHERE shipment_id = $1
              ORDER BY event_occurred_at DESC NULLS LAST, id DESC
              LIMIT 200`,
            [shipmentId],
          ),
        );
        carrierEvents = carrier.rows;
      } catch (carrierErr: any) {
        console.warn('[GET /api/orders/[id]/timeline] carrier spine degraded:', carrierErr?.message);
      }
    }

    // RMA spine — returns/RTV authorized against this order. Org-scoped
    // (`rma_authorizations` is NOT NULL + FORCE RLS since 2026-06-22g).
    let rmaEvents: any[] = [];
    try {
      const rma = await withTenantTransaction(orgId, (client) =>
        client.query(
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
      );
      rmaEvents = rma.rows;
    } catch (rmaErr: any) {
      if (rmaErr?.code !== '42P01') {
        console.warn('[GET /api/orders/[id]/timeline] rma spine degraded:', rmaErr?.message);
      }
    }

    // Notes spine — the `order_notes` TABLE. `orders.notes` is a single free-text
    // COLUMN and was the only note this route ever returned, so every note staff
    // wrote through the notes trail was invisible to FIND. Same guard posture as
    // the thread spine: a missing relation degrades to [], never a 500.
    let orderNotes: any[] = [];
    try {
      const notes = await withTenantTransaction(orgId, (client) =>
        client.query(
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
      );
      orderNotes = notes.rows;
    } catch (noteErr: any) {
      if (noteErr?.code !== '42P01') {
        console.warn('[GET /api/orders/[id]/timeline] notes spine degraded:', noteErr?.message);
      }
    }

    // Signal spine — `entity_signals` is the "why" record (signal_kind,
    // reason_code, severity, notes). It is what answers "why is this held" on the
    // floor, and no FIND face read it: the stream could show an exception row
    // without the reason that caused it.
    let signals: any[] = [];
    try {
      const sig = await withTenantTransaction(orgId, (client) =>
        client.query(
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
      );
      signals = sig.rows;
    } catch (signalErr: any) {
      if (signalErr?.code !== '42P01') {
        console.warn('[GET /api/orders/[id]/timeline] signal spine degraded:', signalErr?.message);
      }
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
    });
  } catch (error: any) {
    console.error('[GET /api/orders/[id]/timeline] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order timeline', details: error?.message },
      { status: 500 },
    );
  }
}
