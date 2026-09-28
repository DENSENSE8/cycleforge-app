/** Auto-allocation — reserve specific serialized units for order lines. */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { NON_PICKABLE_BIN_ROLES, SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { GRADE_ORDER, type ConditionGrade } from '@/lib/orders/condition-tier';
import {
  planAllocations,
  type AllocationDemandLine,
  type AllocationShortfall,
  type AllocationSupplyUnit,
} from './plan-allocations';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';

interface DemandRow {
  id: number;
  order_number: string | null;
  sku: string | null;
  quantity_str: string | null;
  condition: string | null;
}

interface SupplyRow {
  id: number;
  sku: string;
  grade: string | null;
  location: string | null;
}

/**
 * An unrecognised `condition_grade` behaves as ungraded, which the tier gate
 * REFUSES. Failing closed is the right direction: an unknown grade cannot be
 * proven to satisfy a marketplace tier.
 */
function narrowGrade(raw: string | null): ConditionGrade | null {
  if (!raw) return null;
  return (GRADE_ORDER as readonly string[]).includes(raw) ? (raw as ConditionGrade) : null;
}


/** Demand: unallocated order lines that still have to leave the building. */
async function selectDemand(
  client: PoolClient,
  orgId: OrgId,
  orderIds: readonly number[] | null,
): Promise<AllocationDemandLine[]> {
  const res = await client.query<DemandRow>(
    `SELECT o.id,
            o.order_id AS order_number,
            COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), '')) AS sku,
            o.quantity AS quantity_str,
            o.condition
       FROM orders o
       LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND ($2::int[] IS NULL OR o.id = ANY($2::int[]))
        AND COALESCE(o.status, '') <> 'shipped'
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND NOT EXISTS (
          SELECT 1 FROM order_unit_allocations oua
           WHERE oua.order_id = o.id
             AND oua.organization_id = o.organization_id
             AND oua.state <> 'RELEASED'
        )
      ORDER BY o.id ASC`,
    [orgId, orderIds === null ? null : [...orderIds]],
  );

  return res.rows.map((row) => ({
    orderId: row.id,
    orderNumber: row.order_number ?? String(row.id),
    sku: row.sku,
    quantity: Number(row.quantity_str ?? '1'),
    soldCondition: row.condition,
  }));
}

/** Supply: stocked, binned, uncommitted units. */
async function selectSupply(client: PoolClient, orgId: OrgId): Promise<AllocationSupplyUnit[]> {
  const res = await client.query<SupplyRow>(
    `SELECT su.id,
            su.sku,
            su.condition_grade::text AS grade,
            su.current_location AS location
       FROM serial_units su
       LEFT JOIN locations loc ON loc.name = su.current_location
      WHERE su.organization_id = $1
        AND su.current_status = 'STOCKED'::serial_status_enum
        AND su.current_location IS NOT NULL
        AND su.sku IS NOT NULL AND BTRIM(su.sku) <> ''
        AND (loc.id IS NULL OR loc.locked_for_count = false)
        AND (loc.id IS NULL OR COALESCE(loc.bin_role, 'RESERVE') NOT IN ${NON_PICKABLE_BIN_ROLES})
        AND NOT EXISTS (
          SELECT 1 FROM order_unit_allocations oua
           WHERE oua.serial_unit_id = su.id
             AND oua.organization_id = su.organization_id
             AND oua.state <> ALL (ARRAY['RELEASED', 'RETURNED'])
        )
      ORDER BY su.id ASC
      FOR UPDATE OF su SKIP LOCKED`,
    [orgId],
  );

  return res.rows.map((row) => ({
    serialUnitId: row.id,
    sku: row.sku,
    grade: narrowGrade(row.grade),
    location: row.location,
  }));
}

interface AutoAllocateResult {
  inserted: number;
  shortfalls: AllocationShortfall[];
}

/** Plan and persist allocations for `orderIds` — or for EVERY unallocated order in the org when `orderIds` is null. */
export async function autoAllocateForOrders(
  orderIds: readonly number[] | null,
  opts: { orgId: OrgId; staffId?: number | null },
): Promise<AutoAllocateResult> {
  if (orderIds !== null && orderIds.length === 0) return { inserted: 0, shortfalls: [] };
  const scope = orderIds === null ? null : [...new Set(orderIds)];

  return withTenantTransaction(opts.orgId, async (client) => {
    const demand = await selectDemand(client, opts.orgId, scope);
    if (demand.length === 0) return { inserted: 0, shortfalls: [] };
    const supply = await selectSupply(client, opts.orgId);

    const plan = planAllocations(demand, supply);
    if (plan.allocations.length === 0) return { inserted: 0, shortfalls: plan.shortfalls };

    const params: unknown[] = [opts.orgId, opts.staffId ?? null];
    const rows = plan.allocations.map((allocation) => {
      params.push(allocation.orderId, allocation.serialUnitId);
      return `($${params.length - 1}, $${params.length}, $2, 'ALLOCATED', $1)`;
    });

    const res = await client.query<{ order_id: number }>(
      `INSERT INTO order_unit_allocations
         (order_id, serial_unit_id, allocated_by_staff_id, state, organization_id)
       VALUES ${rows.join(', ')}
       ON CONFLICT (serial_unit_id) WHERE state <> ALL (ARRAY['RELEASED'::text, 'RETURNED'::text])
       DO NOTHING
       RETURNING order_id`,
      params,
    );
    // An allocated unit's verdict is the order's (inherited) QC.
    await refreshOrderStageFacts(opts.orgId, { orderIds: res.rows.map((r) => r.order_id) }, client);

    return { inserted: res.rowCount ?? 0, shortfalls: plan.shortfalls };
  });
}

/** Allocate for an ingest that just landed, without ever failing it. */
export async function autoAllocateAfterIngest(
  orderIds: readonly number[],
  opts: { orgId: OrgId; staffId?: number | null; source: string },
): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    const result = await autoAllocateForOrders(orderIds, opts);
    // Log ONLY the shortfall case.
    if (result.shortfalls.length > 0) {
      console.warn(
        `[autoAllocateAfterIngest] ${opts.source}: reserved ${result.inserted} unit(s), ${result.shortfalls.length} line(s) short`,
      );
    }
  } catch (err) {
    console.error(`[autoAllocateAfterIngest] ${opts.source}: allocation skipped —`, err);
  }
}
