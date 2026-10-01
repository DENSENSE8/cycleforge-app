/**
 * Un-pack — the inverse of the pack writers (POST /api/packerlogs,
 * /api/packing-logs/update), run inside the caller's transaction.
 * The PACK activity rows and the packer_log are removed, not flagged: some
 * fifty readers key "packed" off `station_activity_logs` PACK rows and
 * `packer_logs`, and a void flag each of them had to learn is a flag one of
 * them would miss. Removing the final completed ORDERS pack also removes its
 * SHIP_CONFIRM: an unpacked carton cannot retain a scanned-out fact.
 *
 * The record of both operations survives where evidence lives — the original
 * audit rows keep their now-historical activity ids, and the caller appends a
 * `pack.reverse` audit row carrying every removed activity (migration
 * 2026-09-28z made those audit pointers plain columns).
 *
 * What the pack moved is moved back:
 * - units the pack mirrored to PACKED (`sync-legacy-pack`, whose PACKED event
 *   names this packer_log and the prior state) return to that prior state
 *   through the guarded `transition()`, allocation with them;
 * - BOXED ledger deltas that name this packer_log get a compensating
 *   `PACK_UNDO` row (`fn_recompute_sku_stock` re-derives the balance);
 * - the canonical `pack_completed` ops_event (append-only) is answered by a
 *   `pack_reversed` one.
 * Not reversible without a prior value, so left as written: the
 * `orders.status = 'packed'` flag, the auto-completed PACK work_assignment
 * and totes the pack released (none are read as a pack fact).
 */

import type { PoolClient } from 'pg';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import type { OrgId } from '@/lib/tenancy/constants';

/** Pre-pack states a PACKED unit may return to (see the state-machine allow-list). */
const UNPACK_TARGET: Record<string, SerialState> = { PICKED: 'PICKED', ALLOCATED: 'ALLOCATED' };

export interface ReversedPackActivity {
  id: number;
  station: string;
  activityType: string;
  staffId: number | null;
  shipmentId: number | null;
  scanRef: string | null;
  createdAt: string;
}

export interface ReversedPack {
  packerLog: {
    id: number;
    shipmentId: number | null;
    scanRef: string | null;
    trackingType: string | null;
    completionState: string | null;
    packedBy: number | null;
    createdAt: string;
    photoIds: number[];
  } | null;
  activities: ReversedPackActivity[];
  shipmentId: number | null;
  orderIds: number[];
  units: Array<{ unitId: number; allocationId: number | null; to: SerialState; inventoryEventId: number }>;
  /** Units the pack mirrored that could not be returned (moved on since). */
  unitWarnings: string[];
  ledgerReversals: Array<{ id: number; sku: string; delta: number }>;
}

/**
 * Reverse one pack, named by its PACK activity row (`salId`) or its
 * packer_log (`packerLogId`). Returns null when neither exists — the pack is
 * already reversed or never was (callers answer 404).
 */
export async function reversePack(
  client: PoolClient,
  orgId: OrgId,
  input: { salId?: number | null; packerLogId?: number | null; actorStaffId: number | null },
): Promise<ReversedPack | null> {
  let packerLogId = input.packerLogId ?? null;
  let shipmentId: number | null = null;

  if (input.salId != null) {
    const salQ = await client.query<{ packer_log_id: number | null; shipment_id: string | number | null }>(
      `SELECT packer_log_id, shipment_id FROM station_activity_logs
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.salId, orgId],
    );
    const sal = salQ.rows[0];
    if (!sal) return null;
    packerLogId = sal.packer_log_id != null ? Number(sal.packer_log_id) : null;
    shipmentId = sal.shipment_id != null ? Number(sal.shipment_id) : null;
  }

  let packerLog: ReversedPack['packerLog'] = null;
  if (packerLogId != null) {
    const plQ = await client.query<{
      id: number; shipment_id: string | number | null; scan_ref: string | null; tracking_type: string | null;
      completion_state: string | null; packed_by: number | null; created_at: string;
    }>(
      `SELECT id, shipment_id, scan_ref, tracking_type, completion_state, packed_by,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM packer_logs
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [packerLogId, orgId],
    );
    const pl = plQ.rows[0];
    if (pl) {
      const photosQ = await client.query<{ photo_id: string | number }>(
        `SELECT photo_id FROM photo_entity_links
          WHERE organization_id = $1 AND entity_type = 'PACKER_LOG' AND entity_id = $2
          ORDER BY photo_id`,
        [orgId, pl.id],
      );
      packerLog = {
        id: Number(pl.id),
        shipmentId: pl.shipment_id != null ? Number(pl.shipment_id) : null,
        scanRef: pl.scan_ref,
        trackingType: pl.tracking_type,
        completionState: pl.completion_state,
        packedBy: pl.packed_by,
        createdAt: pl.created_at,
        photoIds: photosQ.rows.map((r) => Number(r.photo_id)),
      };
      shipmentId ??= packerLog.shipmentId;
    } else if (input.salId == null) {
      return null;
    }
  }

  const removesFinalOrderPack =
    packerLog?.trackingType === 'ORDERS' &&
    packerLog.completionState === 'COMPLETED' &&
    packerLog.shipmentId != null;
  // 1. The PACK activity rows: the named one and every row of its packer_log.
  const actQ = await client.query<{
    id: number; station: string; activity_type: string; staff_id: number | null;
    shipment_id: string | number | null; scan_ref: string | null; created_at: string;
  }>(
    `DELETE FROM station_activity_logs sal
      WHERE sal.organization_id = $1
        AND (
          sal.id = $2
          OR ($3::int IS NOT NULL AND sal.packer_log_id = $3::int)
          OR (
            $4::bigint IS NOT NULL
            AND sal.activity_type = 'SHIP_CONFIRM'
            AND sal.shipment_id = $4::bigint
            AND NOT EXISTS (
              SELECT 1 FROM packer_logs remaining
               WHERE remaining.organization_id = $1
                 AND remaining.shipment_id = $4::bigint
                 AND remaining.tracking_type = 'ORDERS'
                 AND remaining.completion_state = 'COMPLETED'
                 AND remaining.id <> $3::int
            )
          )
        )
      RETURNING sal.id, sal.station, sal.activity_type, sal.staff_id, sal.shipment_id, sal.scan_ref,
                to_char(sal.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`,
    [orgId, input.salId ?? null, packerLogId, removesFinalOrderPack ? (packerLog?.shipmentId ?? null) : null],
  );
  const activities = actQ.rows
    .map((r) => ({
      id: Number(r.id),
      station: r.station,
      activityType: r.activity_type,
      staffId: r.staff_id,
      shipmentId: r.shipment_id != null ? Number(r.shipment_id) : null,
      scanRef: r.scan_ref,
      createdAt: r.created_at,
    }))
    .sort((a, b) => a.id - b.id);

  // 2. Units the pack mirrored to PACKED, back to the state they held before.
  const units: ReversedPack['units'] = [];
  const unitWarnings: string[] = [];
  if (packerLog) {
    const packedQ = await client.query<{
      serial_unit_id: number; allocation_id: string | null; prior_state: string | null; event_id: string | number;
    }>(
      `SELECT DISTINCT ON (ie.serial_unit_id)
              ie.serial_unit_id, ie.payload->>'allocation_id' AS allocation_id,
              ie.payload->>'prior_state' AS prior_state, ie.id AS event_id
         FROM inventory_events ie
        WHERE ie.organization_id = $1
          AND ie.event_type = 'PACKED'
          AND ie.payload->>'packer_log_id' = $2::text
        ORDER BY ie.serial_unit_id, ie.occurred_at DESC, ie.id DESC`,
      [orgId, packerLog.id],
    );
    for (const ev of packedQ.rows) {
      const to = UNPACK_TARGET[String(ev.prior_state ?? '')];
      const allocationId = ev.allocation_id != null ? Number(ev.allocation_id) : null;
      const allocQ = allocationId != null
        ? await client.query<{ state: string }>(
            `SELECT state::text AS state FROM order_unit_allocations
              WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
            [allocationId, orgId],
          )
        : null;
      const allocState = allocQ?.rows[0]?.state ?? null;
      if (!to || allocState !== 'PACKED') {
        unitWarnings.push(
          `unit ${ev.serial_unit_id}: allocation ${allocState ?? 'missing'}, prior ${ev.prior_state ?? 'unknown'} — left as is`,
        );
        continue;
      }
      const t = await transition(
        {
          unitId: Number(ev.serial_unit_id),
          to,
          eventType: to === 'PICKED' ? 'PICKED' : 'ALLOCATED',
          actorStaffId: input.actorStaffId,
          station: 'PACK',
          expectedFrom: 'PACKED',
          payload: {
            source: 'pack.reverse',
            reversal_of: 'PACKED',
            reverses_event_id: Number(ev.event_id),
            packer_log_id: packerLog.id,
            allocation_id: allocationId,
          },
        },
        client,
        orgId,
      );
      if (!t.ok) {
        unitWarnings.push(`unit ${ev.serial_unit_id}: ${t.error}`);
        continue;
      }
      await client.query(
        `UPDATE order_unit_allocations SET state = $3 WHERE id = $1 AND organization_id = $2`,
        [allocationId, orgId, to],
      );
      units.push({ unitId: Number(ev.serial_unit_id), allocationId, to, inventoryEventId: Number(t.eventId) });
    }
  }

  // 3. BOXED ledger deltas the pack wrote, compensated (never deleted).
  const ledgerQ = packerLog
    ? await client.query<{ id: number; sku: string; delta: number }>(
        `INSERT INTO sku_stock_ledger
           (organization_id, sku, delta, reason, dimension, staff_id,
            ref_packer_log_id, ref_shipment_id, notes)
         SELECT l.organization_id, l.sku, -l.delta, 'PACK_UNDO', l.dimension, $3,
                l.ref_packer_log_id, l.ref_shipment_id, 'un-pack: reverses ledger #' || l.id
           FROM sku_stock_ledger l
          WHERE l.organization_id = $1
            AND l.ref_packer_log_id = $2
            AND l.reason = 'PACKED'
            AND NOT EXISTS (
              SELECT 1 FROM sku_stock_ledger u
               WHERE u.organization_id = l.organization_id
                 AND u.ref_packer_log_id = l.ref_packer_log_id
                 AND u.reason = 'PACK_UNDO'
                 AND u.notes = 'un-pack: reverses ledger #' || l.id
            )
         RETURNING id, sku, delta`,
        [orgId, packerLog.id, input.actorStaffId],
      )
    : null;

  // 4. The packer_log itself (its photo links and verification events go with
  //    it); its canonical `pack_completed` ops_event is answered, not erased.
  if (packerLog) {
    await client.query(`DELETE FROM packer_logs WHERE id = $1 AND organization_id = $2`, [packerLog.id, orgId]);
    await client.query(
      `INSERT INTO ops_events (
         organization_id, occurred_at, event_type, entity_type, entity_id,
         actor_staff_id, client_event_id, workflow_node_id, payload
       ) VALUES ($1::uuid, NOW(), 'pack_reversed', 'other', $2::bigint, $3::int, $4, NULL, $5::jsonb)
       ON CONFLICT (client_event_id) DO NOTHING`,
      [
        orgId,
        packerLog.id,
        input.actorStaffId,
        `packer-log:${packerLog.id}:pack_reversed`,
        JSON.stringify({ source: 'pack.reverse', packerLogId: packerLog.id, shipmentId: packerLog.shipmentId }),
      ],
    );
  }

  shipmentId ??= activities.find((a) => a.shipmentId != null)?.shipmentId ?? null;
  const ordersQ = shipmentId != null
    ? await client.query<{ id: number }>(
        `SELECT id FROM orders WHERE organization_id = $1 AND shipment_id = $2 ORDER BY id`,
        [orgId, shipmentId],
      )
    : null;

  return {
    packerLog,
    activities,
    shipmentId,
    orderIds: (ordersQ?.rows ?? []).map((r) => Number(r.id)),
    units,
    unitWarnings,
    ledgerReversals: (ledgerQ?.rows ?? []).map((r) => ({ id: Number(r.id), sku: r.sku, delta: Number(r.delta) })),
  };
}
