/**
 * Auto-allocation — reserve specific serialized units for order lines.
 *
 * ## Why this exists
 *
 * `order_unit_allocations` (order line ↔ serial unit, "one live allocation per
 * unit") has been in the schema for months and was effectively UNUSED: 4581
 * orders, 116 stocked-and-binned units, one live allocation. Nothing allocated
 * because the only writers were operator-initiated, one-order-at-a-time doors
 * (`/api/orders/[id]/allocate`, the bulk-allocate page). With no allocations
 * the pick surface had nothing line-grained to read and fell back to the
 * SHIPPING feed — which is label-scoped, so an order that has no label yet is
 * invisible to the picker. This is the missing step: orders arrive → units get
 * reserved → a location-directed pick list exists.
 *
 * The matching rules live in `./plan-allocations` (pure, tested). This module
 * is the DB shell: what counts as demand, what counts as supply, and one
 * INSERT.
 *
 * ## What this deliberately does NOT do
 *
 * It does not flip `serial_units.current_status` to ALLOCATED. The reservation
 * IS the allocation row, and the supply query below excludes any unit holding
 * a live one, so a STOCKED unit can never be handed out twice. A status flip
 * is an inventory EVENT (`transition()` plus an `inventory_events` row per
 * unit) and belongs to the operator action that physically moves the unit —
 * the pick confirm — not to a sweep that runs on every sync.
 */

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


/**
 * Demand: unallocated order lines that still have to leave the building.
 *
 * - The `sku_catalog` join is load-bearing — the two sides speak different
 *   SKUs. `orders.sku` holds whatever the marketplace sent ('01279-B'),
 *   `serial_units.sku` holds the internal catalog SKU ('00001-BK'). Matching
 *   the raw strings almost never hits; `orders.sku_catalog_id` is the resolved
 *   link, with the raw string as fallback for rows already stored canonically.
 * - Two independent "already gone" gates, because either one alone is wrong on
 *   this data. `status <> 'shipped'` (the candidate definition
 *   `/inventory/bulk-allocate` uses) drops the 4402 orders this org shipped
 *   last year, but 5 unallocated rows are in carrier hands while their status
 *   still reads `unassigned` — stale local status — so the carrier fragment
 *   catches those. Conversely `shipment_id IS NULL` would be far too strict:
 *   40 unallocated lines have a tracking row but have NOT been accepted by a
 *   carrier, and they are exactly the pre-carrier pick work this whole feature
 *   exists to surface. Absent shipment → LEFT JOIN nulls → COALESCE false.
 * - The `state <> 'RELEASED'` exclusion is what makes a re-run insert 0: only a
 *   RELEASED allocation reopens a line. RETURNED deliberately does NOT — the
 *   unit came back after shipping, the order was filled, and re-allocating
 *   fresh stock to it would send the customer a second unit.
 */
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

/**
 * Supply: stocked, binned, uncommitted units.
 *
 * A location is REQUIRED — this feeds a location-directed pick list, and a
 * unit nobody can be sent to is not supply. `FOR UPDATE OF su SKIP LOCKED` so
 * two concurrent allocators take disjoint subsets instead of racing; the
 * partial UNIQUE index is still the final guarantee.
 *
 * "Committed" mirrors that index predicate exactly (RELEASED and RETURNED are
 * free) rather than the stricter demand-side rule: a returned unit that was
 * put back on the shelf must be sellable again, and the index would let it be
 * allocated whether or not this query agreed.
 */
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

export interface AutoAllocateResult {
  inserted: number;
  shortfalls: AllocationShortfall[];
}

/**
 * Plan and persist allocations for `orderIds` — or for EVERY unallocated order
 * in the org when `orderIds` is null.
 *
 * Idempotent: the demand query skips lines that already hold a live
 * allocation, so a second call inserts 0. `ON CONFLICT DO NOTHING` on the
 * live-allocation index covers the narrower race where a concurrent allocator
 * claimed a unit between this transaction's read and its write — dropping that
 * row is the correct outcome (the unit is spoken for) and keeps the returned
 * `inserted` count honest rather than aborting work that was fine.
 */
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

    const res = await client.query(
      `INSERT INTO order_unit_allocations
         (order_id, serial_unit_id, allocated_by_staff_id, state, organization_id)
       VALUES ${rows.join(', ')}
       ON CONFLICT (serial_unit_id) WHERE state <> ALL (ARRAY['RELEASED'::text, 'RETURNED'::text])
       DO NOTHING`,
      params,
    );

    return { inserted: res.rowCount ?? 0, shortfalls: plan.shortfalls };
  });
}

/**
 * Allocate for an ingest that just landed, without ever failing it.
 *
 * Order import must not break because allocation did: a sync that wrote 400
 * orders and then threw on a bin lookup would be retried from the top, and the
 * operator would read "import failed" about orders that are already in. So
 * this logs and swallows. Shared by every ingest consumer so the guard cannot
 * drift between them.
 */
export async function autoAllocateAfterIngest(
  orderIds: readonly number[],
  opts: { orgId: OrgId; staffId?: number | null; source: string },
): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    const result = await autoAllocateForOrders(orderIds, opts);
    // Log ONLY the shortfall case. A clean sweep is the expected outcome of
    // every import and does not belong in a log anyone tails; the operator's
    // channel for it is the pick list's own shortfall line. A shortfall,
    // though, means demand landed that the shelf cannot fill — worth an eye.
    if (result.shortfalls.length > 0) {
      console.warn(
        `[autoAllocateAfterIngest] ${opts.source}: reserved ${result.inserted} unit(s), ${result.shortfalls.length} line(s) short`,
      );
    }
  } catch (err) {
    console.error(`[autoAllocateAfterIngest] ${opts.source}: allocation skipped —`, err);
  }
}
