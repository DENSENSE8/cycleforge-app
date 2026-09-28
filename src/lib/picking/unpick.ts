/**
 * Picking, in reverse. Every pick writer has an inverse here, and every
 * inverse runs inside the caller's transaction and records itself:
 *
 * - {@link revertUnitPick} — one unit: serial_units PICKED → ALLOCATED through
 *   the guarded `transition()` (its inventory_events ALLOCATED row names the
 *   PICKED event it reverses), the allocation PICKED → ALLOCATED, the
 *   pick-bound serial unlinked, the unit out of the order's tote. The ONE
 *   path: /api/picking/units/unscan, the desk serial undo / remove, the desk
 *   scan delete and the order un-pick all call it.
 * - {@link revertDeskSerialPick} — the unit a desk serial scan picked
 *   (`pickDeskSerialUnit`), and only that: a unit the phone picked, or one the
 *   desk serial merely re-scanned, is left alone.
 * - {@link voidDeskScanSessions} — a desk scan session and everything it wrote
 *   (serial rows, SERIAL_ADDED rows, FNSKU logs), reverting its serials' picks.
 * - {@link unpickOrder} — the whole order back to its pre-pick state.
 *
 * None of these refresh `order_stage_facts`; the caller refreshes once, after
 * its last write, in the same transaction.
 */

import type { PoolClient } from 'pg';
import { transition } from '@/lib/inventory/state-machine';
import { DESK_SERIAL_PICK_SOURCE } from '@/lib/picking/desk-serial-pick';
import { sqlOrderHasPackScan, sqlStationActivityMatchesOrder } from '@/lib/orders/order-grain-sql';
import { clearOrderPackPlacement } from '@/lib/packing/pack-placement';
import { unlinkPickedSerialFromOrder } from '@/lib/picking/pick-serial-link';
import { ORDER_PICK_SCAN_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import type { OrgId } from '@/lib/tenancy/constants';

type Client = Pick<PoolClient, 'query'>;

/** A reversal the caller must not half-apply: throw it to roll the transaction back. */
export class UnpickError extends Error {
  constructor(public readonly status: 404 | 409, message: string) {
    super(message);
    this.name = 'UnpickError';
  }
}

export interface RevertedUnitPick {
  unitId: number;
  allocationId: number;
  orderId: number;
  /** The inventory_events ALLOCATED row this reversal wrote. */
  inventoryEventId: number;
  /** The PICKED / FORCE_PICK event it reverses (null for a pre-ledger pick). */
  reversedEventId: number | null;
}

export type RevertUnitPickResult =
  | ({ ok: true } & RevertedUnitPick)
  | { ok: false; status: 404 | 409; error: string };

/**
 * Un-pick one unit: its PICKED allocation (optionally on `orderId`) and the
 * unit go back to ALLOCATED — still reserved for the order, not released.
 */
export async function revertUnitPick(
  client: Client,
  orgId: OrgId,
  input: {
    serialUnitId: number;
    orderId?: number | null;
    actorStaffId: number | null;
    source: string;
    clientEventId?: string | null;
  },
): Promise<RevertUnitPickResult> {
  const unitQ = await client.query<{ id: number }>(
    `SELECT id FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
    [input.serialUnitId, orgId],
  );
  const unitId = unitQ.rows[0] ? Number(unitQ.rows[0].id) : null;
  if (unitId == null) return { ok: false, status: 404, error: 'serial_units row not found' };

  const byOrder = input.orderId != null;
  const allocQ = await client.query<{ id: string | number; order_id: number; state: string }>(
    `SELECT id, order_id, state::text AS state
       FROM order_unit_allocations
      WHERE serial_unit_id = $1 AND organization_id = $2 AND state <> 'RELEASED'
        ${byOrder ? 'AND order_id = $3' : ''}
      ORDER BY allocated_at DESC LIMIT 1 FOR UPDATE`,
    byOrder ? [unitId, orgId, input.orderId] : [unitId, orgId],
  );
  const alloc = allocQ.rows[0];
  if (!alloc) return { ok: false, status: 409, error: 'no open allocation for this unit' };
  if (alloc.state !== 'PICKED') {
    return { ok: false, status: 409, error: `allocation is ${alloc.state}, not PICKED — cannot un-pick` };
  }
  const allocationId = Number(alloc.id);
  const orderId = Number(alloc.order_id);

  const pickedQ = await client.query<{ id: string | number }>(
    `SELECT id FROM inventory_events
      WHERE organization_id = $1 AND serial_unit_id = $2
        AND event_type IN ('PICKED', 'FORCE_PICK')
      ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [orgId, unitId],
  );
  const reversedEventId = pickedQ.rows[0] ? Number(pickedQ.rows[0].id) : null;

  const t = await transition(
    {
      unitId,
      to: 'ALLOCATED',
      eventType: 'ALLOCATED',
      actorStaffId: input.actorStaffId,
      station: 'PACK',
      clientEventId: input.clientEventId ?? null,
      payload: {
        source: input.source,
        reversal_of: 'PICKED',
        reverses_event_id: reversedEventId,
        allocation_id: allocationId,
        order_id: orderId,
      },
    },
    client,
    orgId,
  );
  if (!t.ok) return { ok: false, status: t.status, error: t.error };

  await client.query(
    `UPDATE order_unit_allocations SET state = 'ALLOCATED' WHERE id = $1 AND organization_id = $2`,
    [allocationId, orgId],
  );
  await unlinkPickedSerialFromOrder(client, orgId, { serialUnitId: unitId, orderId });
  // A phone pick into a tote moved the unit into it (`bindToteForPick`).
  await client.query(
    `UPDATE serial_units su
        SET handling_unit_id = NULL, updated_at = NOW()
      WHERE su.id = $1 AND su.organization_id = $2
        AND su.handling_unit_id IN (
          SELECT hu.id FROM handling_units hu
           WHERE hu.organization_id = $2 AND hu.paired_order_id = $3
        )`,
    [unitId, orgId, orderId],
  );

  return { ok: true, unitId, allocationId, orderId, inventoryEventId: Number(t.eventId), reversedEventId };
}

/**
 * Revert the pick a desk serial scan made. Matches the unit's PICKED
 * allocation on the desk order (or, order unknown, on the session shipment's
 * orders) whose latest pick event is the desk serial pick of that allocation.
 * Returns null when the serial picked nothing; throws {@link UnpickError} when
 * the pick exists but cannot be reverted, so the serial removal rolls back
 * with it.
 */
export async function revertDeskSerialPick(
  client: Client,
  orgId: OrgId,
  input: {
    serial: string;
    orderId: number | null;
    shipmentId: number | null;
    actorStaffId: number | null;
    source: string;
  },
): Promise<RevertedUnitPick | null> {
  const serial = input.serial.trim().toUpperCase();
  if (!serial || (input.orderId == null && input.shipmentId == null)) return null;

  const byOrder = input.orderId != null;
  const matchQ = await client.query<{ serial_unit_id: number; order_id: number }>(
    `SELECT oua.serial_unit_id, oua.order_id
       FROM serial_units su
       JOIN order_unit_allocations oua
         ON oua.serial_unit_id = su.id AND oua.organization_id = su.organization_id
       JOIN LATERAL (
         SELECT ie.payload
           FROM inventory_events ie
          WHERE ie.organization_id = su.organization_id
            AND ie.serial_unit_id = su.id
            AND ie.event_type IN ('PICKED', 'FORCE_PICK')
          ORDER BY ie.occurred_at DESC, ie.id DESC
          LIMIT 1
       ) last_pick ON TRUE
      WHERE su.organization_id = $1
        AND su.normalized_serial = $2
        AND oua.state = 'PICKED'
        AND ${
          byOrder
            ? 'oua.order_id = $3'
            : `oua.order_id IN (SELECT o.id FROM orders o WHERE o.organization_id = $1 AND o.shipment_id = $3)`
        }
        AND last_pick.payload->>'source' = $4
        AND last_pick.payload->>'allocation_id' = oua.id::text
      ORDER BY oua.allocated_at DESC
      LIMIT 1`,
    [orgId, serial, byOrder ? input.orderId : input.shipmentId, DESK_SERIAL_PICK_SOURCE],
  );
  const match = matchQ.rows[0];
  if (!match) return null;

  const reverted = await revertUnitPick(client, orgId, {
    serialUnitId: Number(match.serial_unit_id),
    orderId: Number(match.order_id),
    actorStaffId: input.actorStaffId,
    source: input.source,
  });
  if (!reverted.ok) {
    throw new UnpickError(reverted.status, `Serial ${serial} could not be un-picked: ${reverted.error}`);
  }
  const { ok: _ok, ...unit } = reverted;
  return unit;
}

export interface VoidedDeskScan {
  id: number;
  station: string;
  activityType: string;
  staffId: number | null;
  shipmentId: number | null;
  orderRowId: number | null;
  scanRef: string | null;
  createdAt: string;
}

export interface VoidedDeskScans {
  scans: VoidedDeskScan[];
  serials: Array<{ id: number; serial: string; orderId: number | null }>;
  unpicked: RevertedUnitPick[];
  /** Compensating `PICK_UNDO` ledger rows for the desk SKU picks (`/api/picking/desk/sku`) the sessions made. */
  stockReversals: Array<{ id: number; sku: string; delta: number }>;
}

/**
 * Remove desk scan sessions (the SAL anchors) and what they wrote — their
 * serial rows, the serials' SERIAL_ADDED rows and FNSKU logs — reverting each
 * serial's desk pick first and compensating the stock their SKU picks took.
 * Returns the removed rows for the caller's audit.
 */
export async function voidDeskScanSessions(
  client: Client,
  orgId: OrgId,
  input: { salIds: readonly number[]; actorStaffId: number | null; source: string },
): Promise<VoidedDeskScans> {
  const out: VoidedDeskScans = { scans: [], serials: [], unpicked: [], stockReversals: [] };
  if (input.salIds.length === 0) return out;

  const scansQ = await client.query<{
    id: number; station: string; activity_type: string; staff_id: number | null;
    shipment_id: number | null; order_row_id: number | null; scan_ref: string | null; created_at: string;
  }>(
    `SELECT id, station, activity_type, staff_id, shipment_id, order_row_id, scan_ref,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM station_activity_logs
      WHERE id = ANY($1::int[]) AND organization_id = $2
      ORDER BY id
      FOR UPDATE`,
    [input.salIds, orgId],
  );
  if (scansQ.rows.length === 0) return out;
  out.scans = scansQ.rows.map((r) => ({
    id: Number(r.id),
    station: r.station,
    activityType: r.activity_type,
    staffId: r.staff_id,
    shipmentId: r.shipment_id != null ? Number(r.shipment_id) : null,
    orderRowId: r.order_row_id,
    scanRef: r.scan_ref,
    createdAt: r.created_at,
  }));
  const ids = out.scans.map((s) => s.id);
  const scanById = new Map(out.scans.map((s) => [s.id, s]));

  const serialsQ = await client.query<{
    id: string | number; serial_number: string | null; order_id: number | null; ctx: number;
  }>(
    `SELECT id, serial_number, order_id, context_station_activity_log_id AS ctx
       FROM tech_serial_numbers
      WHERE context_station_activity_log_id = ANY($1::int[]) AND organization_id = $2
      ORDER BY id`,
    [ids, orgId],
  );
  for (const row of serialsQ.rows) {
    const scan = scanById.get(Number(row.ctx));
    const orderId = row.order_id ?? scan?.orderRowId ?? null;
    out.serials.push({ id: Number(row.id), serial: String(row.serial_number ?? ''), orderId });
    const unit = await revertDeskSerialPick(client, orgId, {
      serial: String(row.serial_number ?? ''),
      orderId,
      shipmentId: scan?.shipmentId ?? null,
      actorStaffId: input.actorStaffId,
      source: input.source,
    });
    if (unit) out.unpicked.push(unit);
  }

  // A desk SKU pick decremented warehouse stock against the session; put it back.
  const stockQ = await client.query<{ id: number; sku: string; delta: number }>(
    `INSERT INTO sku_stock_ledger
       (organization_id, sku, delta, reason, dimension, staff_id, ref_sal_id, notes)
     SELECT l.organization_id, l.sku, -l.delta, 'PICK_UNDO', l.dimension, $3,
            l.ref_sal_id, 'un-pick: reverses ledger #' || l.id
       FROM sku_stock_ledger l
      WHERE l.organization_id = $2
        AND l.ref_sal_id = ANY($1::int[])
        AND l.reason = 'PICKED'
     RETURNING id, sku, delta`,
    [ids, orgId, input.actorStaffId],
  );
  out.stockReversals = stockQ.rows.map((r) => ({ id: Number(r.id), sku: r.sku, delta: Number(r.delta) }));

  await client.query(
    `DELETE FROM station_activity_logs
      WHERE activity_type = 'SERIAL_ADDED'
        AND organization_id = $2
        AND tech_serial_number_id IN (
          SELECT id FROM tech_serial_numbers
           WHERE context_station_activity_log_id = ANY($1::int[]) AND organization_id = $2
        )`,
    [ids, orgId],
  );
  await client.query(
    `DELETE FROM tech_serial_numbers WHERE context_station_activity_log_id = ANY($1::int[]) AND organization_id = $2`,
    [ids, orgId],
  );
  await client.query(
    `DELETE FROM fba_fnsku_logs WHERE station_activity_log_id = ANY($1::int[]) AND organization_id = $2`,
    [ids, orgId],
  );
  await client.query(
    `DELETE FROM station_activity_logs WHERE id = ANY($1::int[]) AND organization_id = $2`,
    [ids, orgId],
  );
  return out;
}

export interface UnpickOrderResult {
  orderId: number;
  unpicked: RevertedUnitPick[];
  voided: VoidedDeskScans;
  /** Order-bound serial rows removed that no voided desk scan owned. */
  unboundSerials: Array<{ id: number; serial: string }>;
  abandonedSessionIds: number[];
  releasedTotes: string[];
  clearedPlacement: boolean;
  /** Nothing was left to reverse — a repeat call. */
  alreadyUnpicked: boolean;
}

/**
 * Un-pick an order: every PICKED unit back to ALLOCATED, its pick scans
 * voided (desk scan sessions + serials removed), its picking sessions
 * abandoned, its totes unpaired, and the bench placement its pick scan made
 * cleared. Idempotent: a second call finds nothing and reports
 * `alreadyUnpicked`. Refuses a packed order — un-pack it first.
 */
export async function unpickOrder(
  client: PoolClient,
  orgId: OrgId,
  input: { orderId: number; actorStaffId: number | null; source: string },
): Promise<UnpickOrderResult> {
  const orderQ = await client.query<{ id: number; packed: boolean; packed_units: number }>(
    `SELECT o.id,
            ${sqlOrderHasPackScan('o')} AS packed,
            (SELECT COUNT(*)::int FROM order_unit_allocations oua
              WHERE oua.order_id = o.id AND oua.organization_id = o.organization_id
                AND oua.state IN ('PACKED', 'LABELED', 'STAGED', 'SHIPPED')) AS packed_units
       FROM orders o
      WHERE o.id = $1 AND o.organization_id = $2
      FOR UPDATE OF o`,
    [input.orderId, orgId],
  );
  const order = orderQ.rows[0];
  if (!order) throw new UnpickError(404, `order ${input.orderId} not found`);
  if (order.packed || order.packed_units > 0) {
    throw new UnpickError(409, 'Order is packed — un-pack it before un-picking');
  }
  const orderId = Number(order.id);

  // 1. Units: every PICKED allocation back to ALLOCATED.
  const pickedQ = await client.query<{ serial_unit_id: number }>(
    `SELECT serial_unit_id FROM order_unit_allocations
      WHERE order_id = $1 AND organization_id = $2 AND state = 'PICKED'
      ORDER BY id`,
    [orderId, orgId],
  );
  const unpicked: RevertedUnitPick[] = [];
  for (const row of pickedQ.rows) {
    const r = await revertUnitPick(client, orgId, {
      serialUnitId: Number(row.serial_unit_id),
      orderId,
      actorStaffId: input.actorStaffId,
      source: input.source,
    });
    if (!r.ok) throw new UnpickError(r.status, `unit ${row.serial_unit_id}: ${r.error}`);
    const { ok: _ok, ...unit } = r;
    unpicked.push(unit);
  }

  // 2. Pick scans: every desk scan the order-grain pick fact reads.
  const scansQ = await client.query<{ id: number }>(
    `SELECT sal.id
       FROM orders o
       JOIN station_activity_logs sal
         ON sal.activity_type IN (${sqlInList(ORDER_PICK_SCAN_ACTIVITY_TYPES)})
        AND ${sqlStationActivityMatchesOrder('sal', 'o')}
      WHERE o.id = $1 AND o.organization_id = $2`,
    [orderId, orgId],
  );
  const voided = await voidDeskScanSessions(client, orgId, {
    salIds: scansQ.rows.map((r) => Number(r.id)),
    actorStaffId: input.actorStaffId,
    source: input.source,
  });
  unpicked.push(...voided.unpicked);

  // 3. Serials still bound to the order (a serial is a pick signal).
  const serialsQ = await client.query<{ id: string | number; serial_number: string | null }>(
    `SELECT id, serial_number FROM tech_serial_numbers
      WHERE order_id = $1 AND organization_id = $2 ORDER BY id`,
    [orderId, orgId],
  );
  const unboundSerials = serialsQ.rows.map((r) => ({ id: Number(r.id), serial: String(r.serial_number ?? '') }));
  if (unboundSerials.length > 0) {
    const tsnIds = unboundSerials.map((s) => s.id);
    await client.query(
      `DELETE FROM station_activity_logs
        WHERE activity_type = 'SERIAL_ADDED' AND organization_id = $2
          AND tech_serial_number_id = ANY($1::bigint[])`,
      [tsnIds, orgId],
    );
    await client.query(
      `DELETE FROM tech_serial_numbers WHERE id = ANY($1::bigint[]) AND organization_id = $2`,
      [tsnIds, orgId],
    );
  }

  // 4. Picking sessions: a completed session is a pick fact too — abandon all.
  const sessionsQ = await client.query<{ id: string | number }>(
    `UPDATE picking_sessions
        SET ended_at = COALESCE(ended_at, NOW()),
            abandoned = true,
            notes = concat_ws(' · ', NULLIF(notes, ''),
                              'un-picked ' || to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')
                              || COALESCE(' by staff ' || $3::text, ''))
      WHERE order_id = $1 AND organization_id = $2 AND NOT abandoned
      RETURNING id`,
    [orderId, orgId, input.actorStaffId],
  );

  // 5. Totes paired to the order go back to the shelf, empty.
  const totesQ = await client.query<{ code: string }>(
    `UPDATE handling_units
        SET paired_order_id = NULL, paired_at = NULL, paired_by_staff_id = NULL, status = 'OPEN'
      WHERE organization_id = $1 AND paired_order_id = $2 AND status IN ('OPEN', 'STAGED')
      RETURNING code`,
    [orgId, orderId],
  );

  // 6. The bench placement the pick scan made (placements from the pack floor stay).
  const placementQ = await client.query<{ source: string | null }>(
    `SELECT source FROM order_pack_placements WHERE organization_id = $1 AND order_id = $2 LIMIT 1`,
    [orgId, orderId],
  );
  const clearedPlacement =
    placementQ.rows[0]?.source === 'tech_scan'
      ? await clearOrderPackPlacement(orgId, { orderId, staffId: input.actorStaffId, reason: 'unpick' }, client)
      : false;

  const abandonedSessionIds = sessionsQ.rows.map((r) => Number(r.id));
  const releasedTotes = totesQ.rows.map((r) => r.code);
  return {
    orderId,
    unpicked,
    voided,
    unboundSerials,
    abandonedSessionIds,
    releasedTotes,
    clearedPlacement,
    alreadyUnpicked:
      unpicked.length === 0 &&
      voided.scans.length === 0 &&
      voided.serials.length === 0 &&
      unboundSerials.length === 0 &&
      abandonedSessionIds.length === 0 &&
      releasedTotes.length === 0 &&
      !clearedPlacement,
  };
}
