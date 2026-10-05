import { NextResponse, after } from 'next/server';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { lockUnitsForPickScan, linkPickedSerialToOrder } from '@/lib/picking/pick-serial-link';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import type { OrgId } from '@/lib/tenancy/constants';

interface ScanUnit {
  id: number;
  sku: string | null;
  current_status: string;
}

interface PickUnitInput {
  orgId: OrgId;
  actorStaffId: number | null;
  orderIdInput: number | null;
  binIdInput: number | null;
  overrideMismatch: boolean;
  clientEventId: string | null;
  scanToken: string | null;
}

type PickUnitFailure = {
  ok: false;
  status: number;
  error: string;
  mismatch?: true;
  unitId?: number;
  unitStatus?: string;
  allocationId?: number;
  currentState?: string;
};

interface PickedUnit {
  ok: true;
  unitId: number;
  prevStatus: string;
  nextStatus: string;
  allocationId: number | null;
  orderId: number | null;
  mismatch: boolean;
  inventoryEventId: number | null;
}

/** A member refused mid-call: thrown so the whole pick rolls back, answered with the member's refusal. */
class PickUnitRefused extends Error {
  constructor(readonly failure: PickUnitFailure) {
    super(failure.error);
    this.name = 'PickUnitRefused';
  }
}

/**
 * Pick ONE locked unit on the caller's transaction: its open allocation (on
 * `orderIdInput` when given), the mismatch / override handling, the guarded
 * unit transition, the allocation advance, the serial bound to the order, the
 * stage facts refreshed.
 */
async function pickUnit(
  client: PoolClient,
  unit: ScanUnit,
  input: PickUnitInput,
): Promise<PickedUnit | PickUnitFailure> {
  const { orgId, actorStaffId, orderIdInput, binIdInput, overrideMismatch, clientEventId, scanToken } = input;

  // Find an open ALLOCATED row for this unit. If order_id specified, require
  // the allocation to belong to that order. order_unit_allocations is
  // tenant-owned — scope to this org.
  const allocationParams: Array<number | string> = [unit.id, orgId];
  if (orderIdInput) allocationParams.push(orderIdInput);
  const allocationQ = await client.query<{ id: number; order_id: number; state: string }>(
    `SELECT id, order_id, state::text AS state
         FROM order_unit_allocations
        WHERE serial_unit_id = $1
          AND organization_id = $2
          AND state <> 'RELEASED'
          ${orderIdInput ? 'AND order_id = $3' : ''}
        ORDER BY allocated_at DESC
        LIMIT 1
        FOR UPDATE`,
    allocationParams,
  );
  const allocation = allocationQ.rows[0];

  let mismatch = false;
  if (!allocation) {
    if (!overrideMismatch) {
      return {
        ok: false as const,
        status: 409,
        error: 'no open ALLOCATED row for this unit',
        mismatch: true as const,
        unitId: unit.id,
        unitStatus: unit.current_status,
      };
    }
    mismatch = true;
  } else if (allocation.state !== 'ALLOCATED') {
    if (!overrideMismatch) {
      return {
        ok: false as const,
        status: 409,
        error: `allocation already advanced to ${allocation.state}`,
        mismatch: true as const,
        allocationId: allocation.id,
        currentState: allocation.state,
      };
    }
    mismatch = true;
  }

  // Advance the UNIT first (guarded), THEN the allocation.
  let prevStatus = unit.current_status;
  let eventId: number | null = null;
  if (!mismatch) {
    // Normal pick: a matched open ALLOCATED row exists → guarded ALLOCATED→PICKED.
    const tr = await transition({
      unitId: unit.id,
      to: 'PICKED',
      eventType: 'PICKED',
      actorStaffId,
      station: 'PACK',
      clientEventId,
      expectedFrom: 'ALLOCATED',
      scanToken,
      binId: binIdInput,
      payload: {
        source: 'pick.scan',
        order_id: allocation?.order_id ?? orderIdInput ?? null,
        allocation_id: allocation?.id ?? null,
        mismatch: false,
        override: false,
      },
    }, client, orgId);
    if (!tr.ok) {
      return { ok: false as const, status: tr.status, error: tr.error };
    }
    prevStatus = tr.from;
    eventId = tr.eventId;
    if (binIdInput != null) {
      await client.query(
        `UPDATE serial_units SET current_location = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [String(binIdInput), unit.id, orgId],
      );
    }
  } else {
    // Override force-pick:
    const forcePayload = {
      source: 'pick.scan',
      order_id: allocation?.order_id ?? orderIdInput ?? null,
      allocation_id: allocation?.id ?? null,
      mismatch,
      override: overrideMismatch && mismatch,
      reason: 'force_pick_override',
    };
    if (unit.current_status === 'PICKED') {
      // Idempotent re-scan of an already-picked unit: the guard rejects the
      // identity transition, so skip the status write and only record the
      // FORCE_PICK event (the legacy raw UPDATE was a status no-op here too).
      const ev = await client.query<{ id: number }>(
        `INSERT INTO inventory_events (
            organization_id,
            event_type, actor_staff_id, station,
            serial_unit_id, sku,
            bin_id, prev_status, next_status,
            scan_token, client_event_id, payload
          )
          VALUES ($8, 'FORCE_PICK', $1, 'PACK',
                  $2, $3,
                  $4, 'PICKED', 'PICKED',
                  $5, $6, $7::jsonb)
          ON CONFLICT (client_event_id) DO NOTHING
          RETURNING id`,
        [
          actorStaffId,
          unit.id,
          unit.sku,
          binIdInput,
          scanToken,
          clientEventId,
          JSON.stringify(forcePayload),
          orgId,
        ],
      );
      eventId = ev.rows[0]?.id ?? null;
    } else {
      const tr = await transition({
        unitId: unit.id,
        to: 'PICKED',
        eventType: 'FORCE_PICK',
        actorStaffId,
        station: 'PACK',
        clientEventId,
        expectedFrom: unit.current_status as SerialState,
        scanToken,
        binId: binIdInput,
        payload: forcePayload,
      }, client, orgId);
      if (!tr.ok) {
        return {
          ok: false as const,
          status: tr.status,
          error: tr.error,
          mismatch: true as const,
          unitId: unit.id,
          unitStatus: unit.current_status,
        };
      }
      prevStatus = tr.from;
      eventId = tr.eventId;
    }
    if (binIdInput != null) {
      await client.query(
        `UPDATE serial_units SET current_location = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [String(binIdInput), unit.id, orgId],
      );
    }
  }

  // Advance the allocation only AFTER the unit pick succeeded.
  if (allocation) {
    await client.query(
      `UPDATE order_unit_allocations
            SET state = 'PICKED'
          WHERE id = $1
            AND organization_id = $2`,
      [allocation.id, orgId],
    );
  }
  // The order learns the serial its QC label named (outbound ← pick).
  const pickedOrderId = allocation?.order_id ?? orderIdInput;
  if (pickedOrderId != null) {
    await linkPickedSerialToOrder(client, orgId, { serialUnitId: unit.id, orderId: pickedOrderId });
  }
  await refreshOrderStageFacts(
    orgId,
    { orderIds: [allocation?.order_id ?? orderIdInput], serialUnitIds: [unit.id] },
    client,
  );

  return {
    ok: true as const,
    unitId: unit.id,
    prevStatus,
    nextStatus: 'PICKED',
    allocationId: allocation?.id ?? null,
    orderId: allocation?.order_id ?? orderIdInput ?? null,
    mismatch,
    inventoryEventId: eventId,
  };
}

/**
 * POST /api/picking/units/scan — `serial_unit_id` picks that unit; a `scan`
 * picks every unit it names: one for a unit label / typed serial, each member
 * of the SEALED PREBOX package for a `KIT-…` label. All members pick in one
 * transaction — any member refused rolls the whole call back with its refusal.
 */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));
  const scan = String(body?.scan ?? '').trim();
  const serialUnitIdRaw = Number(body?.serial_unit_id);
  const serialUnitIdInput =
    Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0 ? Math.floor(serialUnitIdRaw) : null;
  const orderIdRaw = Number(body?.order_id);
  const orderIdInput =
    Number.isFinite(orderIdRaw) && orderIdRaw > 0 ? Math.floor(orderIdRaw) : null;
  const binIdRaw = Number(body?.bin_id);
  const binIdInput = Number.isFinite(binIdRaw) && binIdRaw > 0 ? Math.floor(binIdRaw) : null;
  const clientEventId = String(body?.client_event_id || '').trim() || null;
  const overrideMismatch = body?.override_mismatch === true;

  if (!scan && !serialUnitIdInput) {
    return NextResponse.json(
      { ok: false, error: 'scan or serial_unit_id is required' },
      { status: 400 },
    );
  }

  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const orgId = ctx.organizationId;

  const result = await withTenantTransaction(orgId, async (client) => {
    // 1. Resolve the units by id, or by the scanned QC / pre-box label (unit_uid,
    //    GS1 (01)(21), Digital Link, U- handle), a package label (KIT-…) or a
    //    typed serial.
    let scanToken: string | null = null;
    let units: ScanUnit[] = [];
    if (serialUnitIdInput) {
      const unitQ = await client.query<ScanUnit>(
        `SELECT id, sku, current_status::text AS current_status
            FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1
            FOR UPDATE`,
        [serialUnitIdInput, orgId],
      );
      units = unitQ.rows;
    } else {
      const locked = await lockUnitsForPickScan(client, orgId, scan);
      units = locked?.units ?? [];
      scanToken = locked?.scanToken ?? null;
    }
    if (units.length === 0) {
      return { ok: false as const, status: 404, error: 'serial_units row not found' };
    }

    // 2. Pick every unit. A package's members each need their own
    //    client_event_id (inventory_events dedupes on it).
    const picked: PickedUnit[] = [];
    for (const unit of units) {
      const r = await pickUnit(client, unit, {
        orgId,
        actorStaffId,
        orderIdInput,
        binIdInput,
        overrideMismatch,
        clientEventId: clientEventId && units.length > 1 ? `${clientEventId}:${unit.id}` : clientEventId,
        scanToken,
      });
      if (!r.ok) throw new PickUnitRefused(r);
      picked.push(r);
    }
    return {
      ...picked[0],
      unitIds: picked.map((p) => p.unitId),
      orderIds: [...new Set(picked.map((p) => p.orderId).filter((id): id is number => id != null))],
    };
  }).catch((err: unknown) => {
    if (err instanceof PickUnitRefused) return err.failure;
    throw err;
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  // A committed pick changes what the To-ship desk paints (the Pick column), so it has to reach open desks the way a pack scan does — before…
  // refetched (operator ruling 2026-09-14). Rides the same `order.changed`
  const { orderIds, ...response } = result;
  if (orderIds.length > 0) {
    after(() =>
      publishOrderChanged({
        organizationId: orgId,
        orderIds,
        source: 'pick.scan',
      }).catch(() => {}),
    );
  }
  return NextResponse.json(response);
}, { permission: 'picking.scan' });
