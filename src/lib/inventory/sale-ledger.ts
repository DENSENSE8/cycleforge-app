/**
 * The ONE sale decrement: an order line's units leave WAREHOUSE stock as a
 * `SOLD` ledger row (`fn_recompute_sku_stock` re-derives `sku_stock.stock`;
 * the replenish trigger keys on `SOLD`).
 *
 * Written once per order line, at the first of: the phone pack finishing
 * (`/api/packing-logs/update`) or the order leaving the building (dock scan-out
 * / counter handover, `src/lib/outbound/scan-out.ts`). Every later call is a
 * no-op, so the two trigger points never double-count. Units a picker already
 * pulled off stock with a SKU-code scan (`PICKED`, `/api/picking/desk/sku`) are
 * netted out, so that path never double-counts either.
 *
 * Callers run inside a tenant transaction; the order rows are locked first so
 * two concurrent callers serialize on the same "already sold?" read.
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';

type Queryable = Pick<PoolClient, 'query'>;

export interface SaleLedgerRow {
  id: number;
  sku: string;
  delta: number;
  orderRowId: number;
}

export async function emitSaleLedgerForOrders(
  client: Queryable,
  input: {
    orgId: OrgId;
    orderRowIds: readonly number[];
    staffId: number | null;
    refPackerLogId?: number | null;
    refSalId?: number | null;
    notes: string;
  },
): Promise<SaleLedgerRow[]> {
  const ids = [...new Set(input.orderRowIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return [];

  await client.query(
    `SELECT id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[]) ORDER BY id FOR UPDATE`,
    [input.orgId, ids],
  );

  const inserted = await client.query<{ id: number; sku: string; delta: number; ref_order_id: number }>(
    `WITH lines AS (
       SELECT o.id,
              o.order_id AS order_number,
              BTRIM(o.sku) AS sku,
              o.shipment_id,
              COALESCE(NULLIF(regexp_replace(COALESCE(o.quantity, ''), '[^0-9]', '', 'g'), '')::int, 1) AS qty
         FROM orders o
        WHERE o.organization_id = $1
          AND o.id = ANY($2::int[])
          AND o.sku IS NOT NULL AND BTRIM(o.sku) <> ''
          AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
     ), owed AS (
       SELECT l.*,
              l.qty
              - COALESCE((SELECT -SUM(s.delta) FROM sku_stock_ledger s
                           WHERE s.organization_id = $1
                             AND s.ref_order_id = l.id
                             AND s.sku = l.sku
                             AND s.dimension = 'WAREHOUSE'
                             AND s.reason IN ('SOLD', 'SOLD_UNDO')), 0)
              - COALESCE((SELECT -SUM(p.delta) FROM sku_stock_ledger p
                            JOIN station_activity_logs sal
                              ON sal.id = p.ref_sal_id AND sal.organization_id = p.organization_id
                           WHERE p.organization_id = $1
                             AND p.sku = l.sku
                             AND p.dimension = 'WAREHOUSE'
                             AND p.reason IN ('PICKED', 'PICK_UNDO')
                             AND (sal.order_row_id = l.id OR sal.ext_order_id = l.order_number)), 0) AS remaining
         FROM lines l
     )
     INSERT INTO sku_stock_ledger
       (organization_id, sku, delta, reason, dimension, staff_id,
        ref_order_id, ref_shipment_id, ref_packer_log_id, ref_sal_id, notes)
     SELECT $1, sku, -remaining, 'SOLD', 'WAREHOUSE', $3, id, shipment_id, $4, $5, $6
       FROM owed
      WHERE remaining > 0
     RETURNING id, sku, delta, ref_order_id`,
    [input.orgId, ids, input.staffId, input.refPackerLogId ?? null, input.refSalId ?? null, input.notes],
  );
  return inserted.rows.map((r) => ({ id: Number(r.id), sku: r.sku, delta: Number(r.delta), orderRowId: Number(r.ref_order_id) }));
}

/** Compensate the `SOLD` rows one event wrote (un-pack, scan-out undo) — appended, never deleted. */
export async function reverseSaleLedger(
  client: Queryable,
  input: { orgId: OrgId; staffId: number | null; refPackerLogId?: number; refSalId?: number },
): Promise<SaleLedgerRow[]> {
  const byPackerLog = input.refPackerLogId != null;
  const ref = byPackerLog ? input.refPackerLogId : input.refSalId;
  if (ref == null) return [];
  const reversed = await client.query<{ id: number; sku: string; delta: number; ref_order_id: number }>(
    `INSERT INTO sku_stock_ledger
       (organization_id, sku, delta, reason, dimension, staff_id,
        ref_order_id, ref_shipment_id, ref_packer_log_id, ref_sal_id, notes)
     SELECT l.organization_id, l.sku, -l.delta, 'SOLD_UNDO', l.dimension, $3,
            l.ref_order_id, l.ref_shipment_id, l.ref_packer_log_id, l.ref_sal_id,
            'reverses ledger #' || l.id
       FROM sku_stock_ledger l
      WHERE l.organization_id = $1
        AND l.reason = 'SOLD'
        AND ${byPackerLog ? 'l.ref_packer_log_id' : 'l.ref_sal_id'} = $2
        AND NOT EXISTS (
          SELECT 1 FROM sku_stock_ledger u
           WHERE u.organization_id = l.organization_id
             AND u.reason = 'SOLD_UNDO'
             AND u.notes = 'reverses ledger #' || l.id
        )
     RETURNING id, sku, delta, ref_order_id`,
    [input.orgId, ref, input.staffId],
  );
  return reversed.rows.map((r) => ({ id: Number(r.id), sku: r.sku, delta: Number(r.delta), orderRowId: Number(r.ref_order_id) }));
}
