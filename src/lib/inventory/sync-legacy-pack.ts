/** sync-legacy-pack.ts ──────────────────────────────────────────────────────────────────── Phase 3 deliverable #2 — inverse dual-write. */

import pool from '@/lib/db';
import { transition } from '@/lib/inventory/state-machine';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface MirrorInput {
  /** Source packer_logs row id (used for deterministic idempotency key). */
  packerLogId: number;
  /** Shipment to resolve orders against. */
  shipmentId: number | string | null;
  /** When known, attributed to inventory_events.actor_staff_id. */
  actorStaffId?: number | null;
}

export type MirrorResult =
  | { ok: true; mirrored: number; skipped?: string }
  | { ok: false; error: string; mirrored: number };

type LegacyMirrorStage = 'PACKED' | 'SHIPPED';

/** Mirrors SHIPPED state from a legacy packer_logs row into the v2 allocation system. */
async function mirrorLegacyShipmentToAllocations(
  input: MirrorInput,
  /**
   * Tenant scope — REQUIRED, un-defaulted. `transition()` requires it, and a
   * default here would re-introduce the dogfood-org attribution this chain was
   * migrated to remove.
   */
  orgId: OrgId,
  target: LegacyMirrorStage,
): Promise<MirrorResult> {
  if (input.shipmentId == null || input.shipmentId === '') {
    return { ok: true, mirrored: 0, skipped: 'no-shipment-id' };
  }

  const shipIdNum = Number(input.shipmentId);
  if (!Number.isFinite(shipIdNum) || shipIdNum <= 0) {
    return { ok: true, mirrored: 0, skipped: 'invalid-shipment-id' };
  }

  let mirrored = 0;
  try {
    // 1. Resolve orders linked to this shipment.
    const ordersQ = orgId
      ? await tenantQuery<{ id: number }>(
          orgId,
          `SELECT id FROM orders WHERE shipment_id = $1 AND organization_id = $2`,
          [shipIdNum, orgId],
        )
      : await pool.query<{ id: number }>(
          `SELECT id FROM orders WHERE shipment_id = $1`,
          [shipIdNum],
        );
    if (ordersQ.rows.length === 0) {
      return { ok: true, mirrored: 0, skipped: 'no-linked-orders' };
    }
    const orderIds = ordersQ.rows.map((r) => r.id);

    // 2. Resolve open allocations for those orders.
    const allocQ = orgId
      ? await tenantQuery<{
          id: string;
          serial_unit_id: number;
          order_id: number;
          state: string;
        }>(
          orgId,
          `SELECT id, serial_unit_id, order_id, state::text
             FROM order_unit_allocations
            WHERE order_id = ANY($1)
              AND organization_id = $2
              AND state IN ('ALLOCATED','PICKING','PICKED','PACKED','LABELED','STAGED')`,
          [orderIds, orgId],
        )
      : await pool.query<{
          id: string;
          serial_unit_id: number;
          order_id: number;
          state: string;
        }>(
          `SELECT id, serial_unit_id, order_id, state::text
             FROM order_unit_allocations
            WHERE order_id = ANY($1)
              AND state IN ('ALLOCATED','PICKING','PICKED','PACKED','LABELED','STAGED')`,
          [orderIds],
        );
    if (allocQ.rows.length === 0) {
      return { ok: true, mirrored: 0, skipped: 'no-open-allocations' };
    }

    // 3. Per-unit transition. One short-lived txn per unit so a single
    //    failure doesn't cascade across the whole shipment.
    for (const alloc of allocQ.rows) {
      const clientEventId = `legacy-pack-mirror:pl-${input.packerLogId}:unit-${alloc.serial_unit_id}`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Executor pattern:
        if (orgId) {
          await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
        }

        const txResult = await transition(
          {
            unitId: alloc.serial_unit_id,
            to: target,
            eventType: target,
            actorStaffId: input.actorStaffId ?? null,
            station: 'SYSTEM',
            clientEventId,
            notes: `legacy-pack mirror from packer_logs #${input.packerLogId}`,
            payload: {
              source: target === 'PACKED' ? 'legacy_pack_completion' : 'legacy_ship_scanout',
              packer_log_id: input.packerLogId,
              shipment_id: shipIdNum,
              allocation_id: Number(alloc.id),
              order_id: alloc.order_id,
              prior_state: alloc.state,
            },
          },
          client,
          // Thread org into the state machine:
          orgId,
        );
        if (!txResult.ok) {
          // Idempotent retries land here when the unit is already at the target.
          if (txResult.status === 409 && txResult.from === target) {
            await client.query('ROLLBACK');
            mirrored++;
            continue;
          }
          await client.query('ROLLBACK');
          console.warn(
            `[legacy-pack-mirror] unit ${alloc.serial_unit_id} pl#${input.packerLogId} ` +
              `transition failed: status=${txResult.status} from=${txResult.from} error=${txResult.error}`,
          );
          continue;
        }

        // order_unit_allocations is tenant-owned. When orgId is present, add an
        // explicit org-ownership predicate to the UPDATE (the id is already an
        // org-scoped result from step 2, but this keeps the write self-guarding).
        await client.query(
          orgId
            ? `UPDATE order_unit_allocations SET state = $2 WHERE id = $1 AND organization_id = $3`
            : `UPDATE order_unit_allocations SET state = $2 WHERE id = $1`,
          orgId ? [alloc.id, target, orgId] : [alloc.id, target],
        );
        await client.query('COMMIT');
        mirrored++;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
        console.warn(
          `[legacy-pack-mirror] unit ${alloc.serial_unit_id} pl#${input.packerLogId} ` +
            `unexpected error:`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        client.release();
      }
    }

    return { ok: true, mirrored };
  } catch (err) {
    return {
      ok: false,
      mirrored,
      error: err instanceof Error ? err.message : 'legacy-pack-mirror failed',
    };
  }
}

/** Pack completion is an inventory state, not evidence of carrier handoff. */
export function mirrorLegacyPackingToAllocations(input: MirrorInput, orgId: OrgId): Promise<MirrorResult> {
  return mirrorLegacyShipmentToAllocations(input, orgId, 'PACKED');
}

/** Only dock scan-out may use the terminal SHIPPED mirror. */
export function mirrorLegacyPackToAllocations(input: MirrorInput, orgId: OrgId): Promise<MirrorResult> {
  return mirrorLegacyShipmentToAllocations(input, orgId, 'SHIPPED');
}
