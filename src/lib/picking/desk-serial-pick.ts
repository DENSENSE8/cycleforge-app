/**
 * Picker desk serial → unit pick. When the desk records a serial against an
 * order and that serial's unit holds an open allocation on the order, the
 * allocation advances to PICKED through the same guarded `transition()` +
 * inventory_events PICKED write as /api/picking/units/scan, inside the
 * caller's transaction. The feed's `pick_alloc` arm then reads the pick.
 *
 * Never blocks the serial add: every outcome other than a pick is a no-op or a
 * `warning`, and the work runs under a SAVEPOINT so a failed write rolls back
 * only itself. A unit that is sellable but not allocated to this order is NOT
 * force-picked — the unit scan route only does that behind an explicit
 * operator override — so the desk reports a warning instead.
 */

import type { PoolClient } from 'pg';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import type { OrgId } from '@/lib/tenancy/constants';

/** Source tag on the PICKED event — `revertDeskSerialPick` matches it to undo only this pick. */
export const DESK_SERIAL_PICK_SOURCE = 'pick.desk.serial';

/** States a unit can be picked from via its open allocation. */
const PICKABLE_STATE: Record<string, true> = { ALLOCATED: true, PICKING: true };
/** Sellable states the unit scan route would only force-pick under override. */
const SELLABLE_UNIT_STATE: Record<string, true> = { STOCKED: true, TESTED: true, GRADED: true };

export type DeskSerialPickResult =
  | {
      kind: 'picked';
      orderId: number;
      allocationId: number;
      serialUnitId: number;
      inventoryEventId: number;
    }
  /** Re-scan: the allocation is already PICKED or further — nothing written. */
  | { kind: 'already-picked'; orderId: number; allocationId: number }
  | { kind: 'warning'; warning: string }
  /** No order context, no tracked unit, or an unallocated non-sellable unit. */
  | { kind: 'none' };

interface DeskSerialPickInput {
  orgId: OrgId;
  /** Normalized (trim + upper) serial — the serial_units.normalized_serial rule. */
  serial: string;
  /** Order bound to the desk session, when known. */
  orderId: number | null;
  /** Desk session shipment: scopes the pick to its orders when orderId is unknown. */
  shipmentId: number | null;
  /** A session held on an orders exception matched no order — never pick. */
  ordersExceptionId: number | null;
  actorStaffId: number | null;
}

const SAVEPOINT = 'desk_serial_pick';

export async function pickDeskSerialUnit(
  client: Pick<PoolClient, 'query'>,
  input: DeskSerialPickInput,
): Promise<DeskSerialPickResult> {
  if (!input.serial || input.ordersExceptionId != null) return { kind: 'none' };
  if (input.orderId == null && input.shipmentId == null) return { kind: 'none' };

  await client.query(`SAVEPOINT ${SAVEPOINT}`);
  try {
    const result = await pickWithinSavepoint(client, input);
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    console.error('desk serial pick failed:', err);
    return {
      kind: 'warning',
      warning: `Serial ${input.serial} recorded, but its unit pick could not be saved.`,
    };
  }
}

async function pickWithinSavepoint(
  client: Pick<PoolClient, 'query'>,
  input: DeskSerialPickInput,
): Promise<DeskSerialPickResult> {
  const { orgId, serial } = input;

  // 1. The tracked unit, locked first (same lock order as the unit scan route).
  const unitQ = await client.query<{ id: number; current_status: string }>(
    `SELECT id, current_status::text AS current_status
       FROM serial_units
      WHERE normalized_serial = $1
        AND organization_id = $2
      LIMIT 1
      FOR UPDATE`,
    [serial, orgId],
  );
  const unit = unitQ.rows[0];
  if (!unit) return { kind: 'none' };

  // 2. Its open allocation on this desk order (or, order unknown, on an order
  //    riding this desk session's shipment).
  const byOrder = input.orderId != null;
  const allocationQ = await client.query<{ id: number; order_id: number; state: string }>(
    `SELECT oua.id, oua.order_id, oua.state::text AS state
       FROM order_unit_allocations oua
      WHERE oua.serial_unit_id = $1
        AND oua.organization_id = $2
        AND oua.state NOT IN ('RELEASED', 'RETURNED')
        AND ${
          byOrder
            ? 'oua.order_id = $3'
            : `oua.order_id IN (SELECT o.id FROM orders o
                                  WHERE o.organization_id = $2 AND o.shipment_id = $3)`
        }
      ORDER BY oua.allocated_at DESC
      LIMIT 1
      FOR UPDATE`,
    [unit.id, orgId, byOrder ? input.orderId : input.shipmentId],
  );
  const row = allocationQ.rows[0];
  // pg returns BIGINT ids as strings; the result contract is numeric.
  const allocation = row ? { ...row, id: Number(row.id) } : undefined;

  if (!allocation) {
    const elsewhereQ = await client.query<{ order_id: number }>(
      `SELECT order_id
         FROM order_unit_allocations
        WHERE serial_unit_id = $1
          AND organization_id = $2
          AND state NOT IN ('RELEASED', 'RETURNED')
        ORDER BY allocated_at DESC
        LIMIT 1`,
      [unit.id, orgId],
    );
    if (elsewhereQ.rows[0]) {
      return {
        kind: 'warning',
        warning: `Serial ${serial} is allocated to another order — recorded here, but not picked.`,
      };
    }
    if (SELLABLE_UNIT_STATE[unit.current_status]) {
      return {
        kind: 'warning',
        warning: `Serial ${serial} is not allocated to this order — recorded, but not picked.`,
      };
    }
    return { kind: 'none' };
  }

  if (!PICKABLE_STATE[allocation.state]) {
    return { kind: 'already-picked', orderId: allocation.order_id, allocationId: allocation.id };
  }

  // 3. Advance the UNIT first (guarded), THEN the allocation.
  if (!PICKABLE_STATE[unit.current_status]) {
    return {
      kind: 'warning',
      warning: `Serial ${serial} unit is ${unit.current_status}, not ready to pick — recorded, but not picked.`,
    };
  }
  const tr = await transition(
    {
      unitId: unit.id,
      to: 'PICKED',
      eventType: 'PICKED',
      actorStaffId: input.actorStaffId,
      station: 'PACK',
      expectedFrom: unit.current_status as SerialState,
      scanToken: serial,
      payload: {
        source: DESK_SERIAL_PICK_SOURCE,
        order_id: allocation.order_id,
        allocation_id: allocation.id,
      },
    },
    client,
    orgId,
  );
  if (!tr.ok) {
    return { kind: 'warning', warning: `Serial ${serial} recorded, but not picked: ${tr.error}.` };
  }

  await client.query(
    `UPDATE order_unit_allocations
        SET state = 'PICKED'
      WHERE id = $1
        AND organization_id = $2`,
    [allocation.id, orgId],
  );

  return {
    kind: 'picked',
    orderId: allocation.order_id,
    allocationId: allocation.id,
    serialUnitId: unit.id,
    inventoryEventId: Number(tr.eventId),
  };
}
