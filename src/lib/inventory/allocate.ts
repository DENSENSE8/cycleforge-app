/** allocate.ts ──────────────────────────────────────────────────────────────────── Shared allocation transaction. */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  pickableSerialUnitsLeftJoin,
  pickableSerialUnitsWhereClause,
} from '@/lib/inventory/pickability';
import { transition } from '@/lib/inventory/state-machine';
import { allocateShortageUnits } from '@/lib/orders/shortage-inbound';

const VALID_GRADES = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] as const;
export type ConditionGrade = (typeof VALID_GRADES)[number];

export interface AllocateOrderInput {
  orderId: number;
  /** Override orders.quantity. Falls back to that value (or 1) when omitted. */
  quantity?: number;
  /** When set, only STOCKED units with this grade are eligible. */
  conditionGrade?: ConditionGrade | null;
  /** UUID from the caller for retry-safe inventory_events. Per-unit suffixed. */
  clientEventId?: string | null;
  actorStaffId: number | null;
}

export interface AllocateOrderSuccess {
  ok: true;
  orderId: number;
  sku: string;
  requested: number;
  allocated: number;
  partial: boolean;
  units: Array<{ unitId: number; allocationId: number; eventId: number | null }>;
}

export interface AllocateOrderFailure {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
  requested?: number;
  allocated?: number;
}

export type AllocateOrderResult = AllocateOrderSuccess | AllocateOrderFailure;

export function isValidConditionGrade(value: string): value is ConditionGrade {
  return (VALID_GRADES as readonly string[]).includes(value);
}

/** Run the allocation transaction. */
export async function allocateOrder(
  input: AllocateOrderInput,
  /**
   * Tenant scope — REQUIRED, and un-defaulted. `transition()` needs it, and a
   * default here would silently re-introduce the dogfood-org attribution this
   * chain was migrated to remove.
   */
  orgId: OrgId,
): Promise<AllocateOrderResult> {
  return withTenantTransaction<AllocateOrderResult>(orgId, (client) =>
    allocateOrderInTx(client, input, orgId),
  );
}

/**
 * Body of the allocation transaction. The reads/writes carry an explicit
 * `organization_id` predicate (defence-in-depth alongside the GUC set by
 * `withTenantTransaction`).
 */
async function allocateOrderInTx(
  client: PoolClient,
  input: AllocateOrderInput,
  orgId: OrgId,
): Promise<AllocateOrderResult> {
  // 1. Load the order line.
  const orderQ = await client.query<{
    id: number;
    sku: string | null;
    quantity: string | null;
    condition: string | null;
    sku_catalog_id: number | null;
    canonical_sku: string | null;
  }>(
    // The sku_catalog join is on the integer surrogate PK (sc.id), which is
    // globally unique, so it is safe bare; the org gate lives on orders (o).
    `SELECT o.id, o.sku, o.quantity, o.condition, o.sku_catalog_id, sc.sku AS canonical_sku
       FROM orders o
  LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
      WHERE o.id = $1
        ${orgId ? 'AND o.organization_id = $2' : ''}
      LIMIT 1`,
    orgId ? [input.orderId, orgId] : [input.orderId],
  );
  const order = orderQ.rows[0];
  if (!order) return { ok: false, status: 404, error: 'order not found' };

  const matchSku = (order.canonical_sku?.trim() || order.sku?.trim() || '').trim();
  if (!matchSku) {
    return { ok: false, status: 400, error: 'order has no sku — cannot allocate' };
  }

  const qtyOverrideValid = Number.isFinite(input.quantity) && (input.quantity ?? 0) > 0;
  const targetQty = qtyOverrideValid
    ? Math.floor(input.quantity as number)
    : Math.max(1, Math.floor(Number(order.quantity ?? '1') || 1));

  // 2. Select candidate units — pickable, matching SKU, oldest first.
  const pickableWhere = pickableSerialUnitsWhereClause();
  const pickableJoin = pickableSerialUnitsLeftJoin();
  const candidatesQ = await client.query<{
    id: number;
    current_location: string | null;
    condition_grade: string | null;
  }>(
    `SELECT su.id, su.current_location, su.condition_grade::text AS condition_grade
       FROM serial_units su
       ${pickableJoin}
      WHERE ${pickableWhere}
        AND su.sku = $1
        AND ($2::text IS NULL OR su.condition_grade::text = $2)
        ${orgId ? 'AND su.organization_id = $4' : ''}
      ORDER BY su.id ASC
      LIMIT $3
      FOR UPDATE OF su SKIP LOCKED`,
    orgId
      ? [matchSku, input.conditionGrade ?? null, targetQty, orgId]
      : [matchSku, input.conditionGrade ?? null, targetQty],
  );
  const candidates = candidatesQ.rows;
  if (candidates.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'no STOCKED serial_units available for sku',
      requested: targetQty,
      allocated: 0,
    };
  }

  // 3. Per-unit allocation + state flip + event row.
  const allocated: AllocateOrderSuccess['units'] = [];
  for (let i = 0; i < candidates.length; i++) {
    const unit = candidates[i];

    const allocQ = await client.query<{ id: number }>(
      // Stamp organization_id on the allocation row when org is threaded so the
      // tenant-owned order_unit_allocations table isolates correctly.
      orgId
        ? `INSERT INTO order_unit_allocations (order_id, serial_unit_id, allocated_by_staff_id, state, organization_id)
           VALUES ($1, $2, $3, 'ALLOCATED', $4)
           RETURNING id`
        : `INSERT INTO order_unit_allocations (order_id, serial_unit_id, allocated_by_staff_id, state)
           VALUES ($1, $2, $3, 'ALLOCATED')
           RETURNING id`,
      orgId
        ? [input.orderId, unit.id, input.actorStaffId, orgId]
        : [input.orderId, unit.id, input.actorStaffId],
    );
    const allocationId = allocQ.rows[0]?.id;
    if (allocationId == null) {
      throw new Error(`allocation insert returned no id for unit ${unit.id}`);
    }

    // Guarded STOCKED→ALLOCATED transition + atomic ALLOCATED event, replacing the former raw status UPDATE + manual event INSERT.
    const perUnitClientEventId = input.clientEventId
      ? `${input.clientEventId}:${unit.id}`
      : null;
    const t = await transition({
      unitId: unit.id,
      to: 'ALLOCATED',
      eventType: 'ALLOCATED',
      actorStaffId: input.actorStaffId,
      station: 'SYSTEM',
      clientEventId: perUnitClientEventId,
      expectedFrom: 'STOCKED',
      payload: {
        source: 'orders.allocate',
        order_id: input.orderId,
        allocation_id: allocationId,
        ordinal: i + 1,
        platform_sku: order.sku,
        sku_catalog_id: order.sku_catalog_id,
      },
    }, client, orgId);
    if (!t.ok) {
      throw new Error(`allocate: STOCKED→ALLOCATED failed for unit ${unit.id}: ${t.error}`);
    }
    allocated.push({ unitId: unit.id, allocationId, eventId: t.eventId });
  }

  await allocateShortageUnits(client, {
    orgId,
    orderId: input.orderId,
    units: allocated.map((row) => ({ unitId: row.unitId })),
  });

  return {
    ok: true,
    orderId: input.orderId,
    sku: matchSku,
    requested: targetQty,
    allocated: allocated.length,
    partial: allocated.length < targetQty,
    units: allocated,
  };
}
