import { NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseScannedUrl } from '@/lib/scan-resolver';
import { transition } from '@/lib/inventory/state-machine';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tapWorkflow } from '@/lib/workflow/tap';
import { isUnifiedEngineFulfillmentTaps, isFulfillmentSubstitution } from '@/lib/feature-flags';
import { clearOrderPackPlacement } from '@/lib/packing/pack-placement';
import { clearUnitPackPlacement } from '@/lib/packing/unit-pack-placement';
import { createPackerLog } from '@/lib/packing/packer-log-writer';
import { createStationActivityLog } from '@/lib/station-activity';
import { buyerNoteHoldBody, readBuyerNoteHold } from '@/lib/orders/buyer-note-interlock';

/** Thrown when a unit's guarded SHIPPED transition is rejected (it isn't in a shippable state). */
class UnitTransitionError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly unitId: number,
    readonly fromStatus: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'UnitTransitionError';
  }
}

/** POST /api/pack/ship */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));
  const orderId = Number(body?.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ ok: false, error: 'order_id is required' }, { status: 400 });
  }

  const rawSerials: string[] = Array.isArray(body?.serials)
    ? body.serials.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
    : [];
  const explicitIds: number[] = Array.isArray(body?.serial_unit_ids)
    ? body.serial_unit_ids
        .map((x: unknown) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
        .map((n: number) => Math.floor(n))
    : [];

  if (rawSerials.length === 0 && explicitIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'serials or serial_unit_ids is required' },
      { status: 400 },
    );
  }

  // Resolve each raw serial (may be GS1 Digital Link URL) to a normalized
  // form for the lookup.
  const normalizedSerials = rawSerials.map((raw) => {
    const url = parseScannedUrl(raw);
    if (url && url.type === 'unit') return url.unitSerial.toUpperCase();
    return raw.toUpperCase();
  });

  const trackingNumber = String(body?.tracking_number || '').trim() || null;
  const carrier = String(body?.carrier || '').trim() || null;
  const clientEventId = String(body?.client_event_id || '').trim() || null;

  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const orgId = ctx.organizationId;

  try {
    // GUC-wrapped: every tenant table this route touches (orders, order_unit_allocations, serial_units, inventory_events, sku_stock_ledger,…
    const result = await withTenantTransaction(orgId, async (client) => {
      // 1. Resolve all units in one round trip.
      const unitsQ = await client.query<{ id: number; sku: string | null; current_status: string; normalized_serial: string }>(
        `SELECT id, sku, current_status::text AS current_status, normalized_serial
           FROM serial_units
          WHERE (id = ANY($1::int[])
             OR normalized_serial = ANY($2::text[]))
            AND organization_id = $3
          FOR UPDATE`,
        [explicitIds, normalizedSerials, orgId],
      );
      const units = unitsQ.rows;

      // 2. Validate: every input must resolve. Collect any misses.
      const foundBySerial = new Map<string, typeof units[number]>();
      const foundById = new Map<number, typeof units[number]>();
      for (const u of units) {
        foundBySerial.set(u.normalized_serial, u);
        foundById.set(u.id, u);
      }
      const missingSerials = normalizedSerials.filter((s) => !foundBySerial.has(s));
      const missingIds = explicitIds.filter((id) => !foundById.has(id));
      if (missingSerials.length || missingIds.length) {
        return {
          ok: false as const,
          status: 404,
          error: 'some units not found',
          missing_serials: missingSerials,
          missing_ids: missingIds,
        };
      }

      // 3. Validate: every unit must have an open allocation for THIS order
      //    in a pre-SHIPPED state. Mismatch → 409, zero mutations committed.
      const unitIds = units.map((u) => u.id);
      const allocQ = await client.query<{
        id: number;
        order_id: number;
        serial_unit_id: number;
        state: string;
      }>(
        `SELECT id, order_id, serial_unit_id, state::text AS state
           FROM order_unit_allocations
          WHERE serial_unit_id = ANY($1::int[])
            AND state <> 'RELEASED'
            AND organization_id = $2
          FOR UPDATE`,
        [unitIds, orgId],
      );
      const allocByUnit = new Map<number, typeof allocQ.rows[number]>();
      for (const a of allocQ.rows) allocByUnit.set(a.serial_unit_id, a);

      const mismatches: Array<{ unitId: number; reason: string; allocationOrderId?: number; allocationState?: string }> = [];
      for (const u of units) {
        const a = allocByUnit.get(u.id);
        if (!a) {
          mismatches.push({ unitId: u.id, reason: 'no open allocation' });
        } else if (a.order_id !== orderId) {
          mismatches.push({
            unitId: u.id,
            reason: 'allocation belongs to a different order',
            allocationOrderId: a.order_id,
          });
        } else if (a.state === 'SHIPPED') {
          mismatches.push({
            unitId: u.id,
            reason: 'allocation already SHIPPED',
            allocationState: a.state,
          });
        }
      }
      if (mismatches.length > 0) {
        return { ok: false as const, status: 409, error: 'allocation mismatch', mismatches };
      }

      // 4. Resolve order metadata.
      const orderQ = await client.query<{ id: number; sku: string | null; shipment_id: number | null; status: string | null }>(
        `SELECT id, sku, shipment_id, status FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
        [orderId, orgId],
      );
      const order = orderQ.rows[0];
      if (!order) {
        return { ok: false as const, status: 404, error: 'order not found' };
      }

      // 4a. Buyer-note interlock: the order's current buyer note must be
      //     acknowledged before it packs (src/lib/orders/buyer-note-interlock.ts).
      const buyerNoteHold = await readBuyerNoteHold(client, orgId, orderId);
      if (buyerNoteHold) {
        return { ...buyerNoteHoldBody(buyerNoteHold), status: 409 };
      }

      // 4b. Block-until-approved gate:
      if (isFulfillmentSubstitution()) {
        const pendingQ = await client.query<{ id: number }>(
          `SELECT id FROM order_unit_amendments
            WHERE order_id = $1
              AND organization_id = $2
              AND status = 'PENDING'
            LIMIT 1`,
          [orderId, orgId],
        );
        if (pendingQ.rows[0]) {
          return {
            ok: false as const,
            status: 409,
            error: 'amendment_pending',
            amendment_id: pendingQ.rows[0].id,
          };
        }
      }

      // 5. Per-unit transitions + events + ledger.
      const perUnit: Array<{
        unitId: number;
        allocationId: number;
        prevStatus: string;
        packedEventId: number | null;
        labeledEventId: number | null;
        shippedEventId: number | null;
        ledgerId: number | null;
      }> = [];

      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const a = allocByUnit.get(u.id)!;

        // 5a. Allocation → SHIPPED.
        await client.query(
          `UPDATE order_unit_allocations SET state = 'SHIPPED' WHERE id = $1 AND organization_id = $2`,
          [a.id, orgId],
        );

        // 5b. inventory_events PACKED (idempotent).
        const packedKey = clientEventId ? `${clientEventId}:${u.id}:PACKED` : null;
        const packedEv = await client.query<{ id: number }>(
          `INSERT INTO inventory_events (
             organization_id, event_type, actor_staff_id, station, serial_unit_id, sku,
             prev_status, next_status, client_event_id, payload
           )
           VALUES ($7::uuid, 'PACKED', $1, 'PACK', $2, $3, $4, 'PACKED', $5, $6::jsonb)
           ON CONFLICT (client_event_id) DO NOTHING
           RETURNING id`,
          [
            actorStaffId, u.id, u.sku, u.current_status, packedKey,
            JSON.stringify({ source: 'pack.ship', order_id: orderId, allocation_id: a.id, ordinal: i + 1 }),
            ctx.organizationId,
          ],
        );

        // 5c. inventory_events LABELED.
        const labeledKey = clientEventId ? `${clientEventId}:${u.id}:LABELED` : null;
        const labeledEv = await client.query<{ id: number }>(
          `INSERT INTO inventory_events (
             organization_id, event_type, actor_staff_id, station, serial_unit_id, sku,
             prev_status, next_status, client_event_id, payload
           )
           VALUES ($6::uuid, 'LABELED', $1, 'PACK', $2, $3, 'PACKED', 'LABELED', $4, $5::jsonb)
           ON CONFLICT (client_event_id) DO NOTHING
           RETURNING id`,
          [
            actorStaffId, u.id, u.sku, labeledKey,
            JSON.stringify({ source: 'pack.ship', order_id: orderId, tracking_number: trackingNumber, carrier }),
            ctx.organizationId,
          ],
        );

        // 5d. sku_stock_ledger row — THE DECREMENT. delta=-1 per unit on
        //     the WAREHOUSE dimension. Trigger fn_recompute_sku_stock()
        //     projects this onto sku_stock atomically.
        let ledgerId: number | null = null;
        if (u.sku) {
          const ledger = await client.query<{ id: number }>(
            `INSERT INTO sku_stock_ledger (
               organization_id, sku, delta, reason, dimension, staff_id,
               ref_serial_unit_id, ref_order_id, ref_shipment_id, notes
             )
             VALUES ($7::uuid, $1, -1, 'SOLD', 'WAREHOUSE', $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              u.sku, actorStaffId, u.id, orderId, order.shipment_id ?? null,
              `pack.ship order=${orderId} alloc=${a.id} unit=${u.id}`,
              ctx.organizationId,
            ],
          );
          ledgerId = ledger.rows[0]?.id ?? null;
        }

        // 5e+5f. serial_units → SHIPPED via the guarded state machine.
        const shippedKey = clientEventId ? `${clientEventId}:${u.id}:SHIPPED` : null;
        const t = await transition(
          {
            unitId: u.id,
            to: 'SHIPPED',
            eventType: 'SHIPPED',
            actorStaffId,
            station: 'SHIP',
            clientEventId: shippedKey ?? undefined,
            stockLedgerId: ledgerId ?? undefined,
            payload: {
              source: 'pack.ship',
              order_id: orderId,
              allocation_id: a.id,
              tracking_number: trackingNumber,
              carrier,
            },
          },
          client,
          orgId,
        );
        if (!t.ok) {
          throw new UnitTransitionError(t.status, u.id, t.from ?? null, t.error);
        }

        perUnit.push({
          unitId: u.id,
          allocationId: a.id,
          prevStatus: u.current_status,
          packedEventId: packedEv.rows[0]?.id ?? null,
          labeledEventId: labeledEv.rows[0]?.id ?? null,
          shippedEventId: t.eventId,
          ledgerId,
        });
      }

      // 6. One packer_logs row for the order — keeps the existing
      //    shipped-dashboard query working.
      const packerLog = await createPackerLog(client, {
        organizationId: ctx.organizationId,
        shipmentId: order.shipment_id ?? null,
        scanRef: trackingNumber,
        trackingType: 'ORDERS',
        packedBy: actorStaffId,
        source: 'pack.ship',
      });

      // 7. One SAL row for cross-station visibility.
      await createStationActivityLog(client, {
        organizationId: ctx.organizationId,
        station: 'PACK',
        activityType: 'PACK_SHIPPED',
        shipmentId: order.shipment_id ?? null,
        scanRef: trackingNumber,
        staffId: actorStaffId,
        packerLogId: packerLog?.id ?? null,
        notes: `inventory v2 shipped order=${orderId} units=${perUnit.length}`,
        metadata: {
          source: 'pack.ship',
          order_id: orderId,
          tracking_number: trackingNumber,
          carrier,
          units: perUnit.length,
        },
      });

      // 8. Flip the order status last so observers see the events first.
      await client.query(
        `UPDATE orders SET status = 'shipped' WHERE id = $1 AND organization_id = $2`,
        [orderId, orgId],
      );

      // 9. Clear packing-station placement — order left the ready-to-pack board.
      await clearOrderPackPlacement(
        orgId,
        { orderId, staffId: actorStaffId, reason: 'pack_complete' },
        client,
      );

      // 10. Clear loose-unit placement for each shipped unit — a unit staged on a bench has left the pack floor.
      for (const u of perUnit) {
        await clearUnitPackPlacement(
          orgId,
          { unitId: u.unitId, staffId: actorStaffId, reason: 'pack_complete' },
          client,
        );
      }

      return {
        ok: true as const,
        orderId,
        shipmentId: order.shipment_id ?? null,
        shipped_unit_count: perUnit.length,
        units: perUnit,
        packer_log_id: packerLog?.id ?? null,
      };
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    // Formal audit-log row for the shipped order.
    await recordAudit(pool, ctx, request, {
      source: 'pack.ship',
      action: AUDIT_ACTION.PACK_COMPLETED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      method: 'manual',
      after: { status: 'shipped' },
      extra: {
        shipped_unit_count: result.shipped_unit_count,
        shipment_id: result.shipmentId,
        tracking_number: trackingNumber,
        carrier,
        packer_log_id: result.packer_log_id,
        unit_ids: result.units.map((u) => u.unitId),
      },
    });

    // Phase 1.4/1.5 fulfillment tail:
    if (isUnifiedEngineFulfillmentTaps()) {
      after(async () => {
        for (const u of result.units) {
          await tapWorkflow({
            serialUnitId: u.unitId,
            event: 'packed',
            input: { shipmentId: result.shipmentId },
            staffId: actorStaffId,
            source: 'scan',
            orgId: ctx.organizationId,
            expectNodeType: 'pack',
          });
          await tapWorkflow({
            serialUnitId: u.unitId,
            event: 'shipped',
            input: { shipmentId: result.shipmentId, trackingNumber, carrier },
            staffId: actorStaffId,
            source: 'scan',
            orgId: ctx.organizationId,
            expectNodeType: 'ship',
          });
        }
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    // A unit that wasn't in a shippable state rolled the whole transaction
    // back — surface the transition's own status (404/409), not a 500. We do
    // NOT force-ship.
    if (err instanceof UnitTransitionError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          mismatches: [
            { unitId: err.unitId, reason: 'not in a shippable state', fromStatus: err.fromStatus },
          ],
        },
        { status: err.httpStatus },
      );
    }
    const message = err instanceof Error ? err.message : 'pack ship failed';
    console.error('[POST /api/pack/ship] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'packing.complete_order' });
