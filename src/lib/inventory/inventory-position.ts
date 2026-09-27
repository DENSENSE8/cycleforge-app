/**
 * CycleForge's own inventory position per catalog item — no external
 * inventory system (Zoho) consulted.
 *
 *   onHand     units physically in the building: serialized units in a
 *              warehouse status, or — for a non-serialized item — bin quantity;
 *   pickable   units free to allocate now (the pickability rule: STOCKED, in a
 *              pickable, unlocked bin) — or bin quantity for non-serialized;
 *   allocated  units held by an order (ALLOCATED, not yet picked);
 *   incoming   open inbound PO lines: expected − received;
 *   available  free to promise now = pickable (an allocated unit is no longer
 *              STOCKED, so it is already out of `pickable`).
 *
 * An item is SERIALIZED when any serial unit exists for it; its bin quantity is
 * then not added (bins of serialized items count units, not a second stock).
 */

import type { QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { pickableSerialUnitsLeftJoin, pickableSerialUnitsWhereClause } from '@/lib/inventory/pickability';

/** Serial statuses that mean "in our building". Everything else has left, is unknown, or is scrap. */
export const IN_BUILDING_SERIAL_STATUSES = [
  'RECEIVED', 'TRIAGED', 'IN_TEST', 'TESTED', 'GRADED', 'IN_REPAIR', 'REPAIR_DONE',
  'ON_HOLD', 'LABELED', 'STAGED', 'STOCKED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED',
] as const;

export interface InventoryPosition {
  skuCatalogId: number;
  sku: string;
  serialized: boolean;
  onHand: number;
  pickable: number;
  allocated: number;
  incoming: number;
  available: number;
}

type Query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: ReadonlyArray<unknown>) => Promise<{ rows: T[] }>;

export async function readInventoryPositions(
  query: Query,
  orgId: OrgId,
  skuCatalogIds: readonly number[],
): Promise<Map<number, InventoryPosition>> {
  const out = new Map<number, InventoryPosition>();
  if (skuCatalogIds.length === 0) return out;
  const r = await query<{
    id: number;
    sku: string;
    serial_units: number;
    on_hand_units: number;
    pickable_units: number;
    allocated_units: number;
    bin_qty: number;
    incoming: number;
  }>(
    `SELECT sc.id, sc.sku,
            (SELECT count(*)::int FROM serial_units su
              WHERE su.organization_id = sc.organization_id
                AND (su.sku_catalog_id = sc.id OR (su.sku_catalog_id IS NULL AND su.sku = sc.sku))) AS serial_units,
            (SELECT count(*)::int FROM serial_units su
              WHERE su.organization_id = sc.organization_id
                AND (su.sku_catalog_id = sc.id OR (su.sku_catalog_id IS NULL AND su.sku = sc.sku))
                AND su.current_status::text = ANY($3::text[])) AS on_hand_units,
            (SELECT count(*)::int FROM serial_units su
               ${pickableSerialUnitsLeftJoin()}
              WHERE su.organization_id = sc.organization_id
                AND (su.sku_catalog_id = sc.id OR (su.sku_catalog_id IS NULL AND su.sku = sc.sku))
                AND ${pickableSerialUnitsWhereClause()}) AS pickable_units,
            (SELECT count(*)::int FROM order_unit_allocations a
               JOIN serial_units su ON su.id = a.serial_unit_id AND su.organization_id = a.organization_id
              WHERE a.organization_id = sc.organization_id
                AND a.state = 'ALLOCATED'
                AND (su.sku_catalog_id = sc.id OR (su.sku_catalog_id IS NULL AND su.sku = sc.sku))) AS allocated_units,
            (SELECT COALESCE(sum(b.qty), 0)::int FROM bin_contents b
              WHERE b.organization_id = sc.organization_id AND b.sku = sc.sku) AS bin_qty,
            (SELECT COALESCE(sum(GREATEST(COALESCE(rl.quantity_expected, 0) - COALESCE(rl.quantity_received, 0), 0)), 0)::int
               FROM receiving_line rl
               JOIN inbound_order io ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
              WHERE rl.organization_id = sc.organization_id
                AND rl.sku_catalog_id = sc.id
                AND io.receiving_type = 'PO'
                AND io.status IN ('open', 'partially_received')) AS incoming
       FROM sku_catalog sc
      WHERE sc.organization_id = $1 AND sc.id = ANY($2::int[])`,
    [orgId, [...skuCatalogIds], [...IN_BUILDING_SERIAL_STATUSES]],
  );
  for (const row of r.rows) {
    const serialized = Number(row.serial_units) > 0;
    const onHand = serialized ? Number(row.on_hand_units) : Number(row.bin_qty);
    const pickable = serialized ? Number(row.pickable_units) : Number(row.bin_qty);
    out.set(Number(row.id), {
      skuCatalogId: Number(row.id),
      sku: row.sku,
      serialized,
      onHand,
      pickable,
      allocated: Number(row.allocated_units),
      incoming: Number(row.incoming),
      available: pickable,
    });
  }
  return out;
}
