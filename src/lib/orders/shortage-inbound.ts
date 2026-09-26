/** Earmark inbound / stocked units onto open order-line shortages. */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { syncOrderShortageDenorm } from '@/lib/orders/order-line-shortage';

export type ShortageInboundClient = Pick<PoolClient, 'query'>;

export async function earmarkPoForReplenishmentRequest(
  client: ShortageInboundClient,
  args: {
    orgId: OrgId;
    replenishmentRequestId: string;
    zohoPoId: string;
    zohoPoNumber?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO shortage_inbound_links (
       organization_id, shortage_id, source_kind, replenishment_request_id,
       zoho_po_id, qty, link_status
     )
     SELECT ols.organization_id, ols.id, 'po_line', $1, $2, ols.qty_short, 'reserved'
       FROM order_line_shortages ols
      WHERE ols.organization_id = $3
        AND ols.replenishment_request_id = $1
        AND ols.status <> 'cleared'
     ON CONFLICT DO NOTHING`,
    [args.replenishmentRequestId, args.zohoPoId, args.orgId],
  );

  await client.query(
    `UPDATE order_line_shortages
        SET status = 'on_po'
      WHERE organization_id = $1
        AND replenishment_request_id = $2
        AND status = 'open'`,
    [args.orgId, args.replenishmentRequestId],
  );
}

export async function advanceShortageForReceivingLines(
  client: ShortageInboundClient,
  args: {
    orgId: OrgId;
    receivingLineIds: number[];
    nextWorkflow: 'MATCHED' | 'UNBOXED';
  },
): Promise<void> {
  if (args.receivingLineIds.length === 0) return;
  const linkStatus = args.nextWorkflow === 'UNBOXED' ? 'unboxed' : 'in_transit';
  const shortageStatus = args.nextWorkflow === 'UNBOXED' ? 'received' : 'inbound';

  const zohoRows = await client.query<{
    receiving_line_id: number;
    zoho_item_id: string | null;
    sku_catalog_id: number | null;
    qty: number | null;
  }>(
    `SELECT rl.id AS receiving_line_id,
            rz.zoho_item_id,
            rl.sku_catalog_id,
            COALESCE(rl.quantity_received, rl.quantity_expected, rl.quantity, 1)::int AS qty
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
      WHERE rl.id = ANY($1::int[])
        AND rl.organization_id = $2`,
    [args.receivingLineIds, args.orgId],
  );

  for (const row of zohoRows.rows) {
    const zoho = String(row.zoho_item_id || '').trim();
    if (!zoho) continue;

    const shortage = await client.query<{ id: string; order_id: number; qty_short: string }>(
      `SELECT id, order_id, qty_short
         FROM order_line_shortages
        WHERE organization_id = $1
          AND zoho_item_id = $2
          AND status <> 'cleared'
          AND status <> 'allocated'
        ORDER BY created_at ASC
        LIMIT 1`,
      [args.orgId, zoho],
    );
    const target = shortage.rows[0];
    if (!target) continue;

    await client.query(
      `INSERT INTO shortage_inbound_links (
         organization_id, shortage_id, source_kind, receiving_line_id, qty, link_status
       ) VALUES ($1, $2, 'receiving_line', $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [args.orgId, target.id, row.receiving_line_id, row.qty ?? 1, linkStatus],
    );

    await client.query(
      `UPDATE shortage_inbound_links
          SET link_status = $4, updated_at = NOW()
        WHERE organization_id = $1
          AND shortage_id = $2
          AND receiving_line_id = $3`,
      [args.orgId, target.id, row.receiving_line_id, linkStatus],
    );

    await client.query(
      `UPDATE order_line_shortages
          SET status = $3
        WHERE id = $1 AND organization_id = $2 AND status <> 'cleared' AND status <> 'allocated'`,
      [target.id, args.orgId, shortageStatus],
    );
  }
}

export async function allocateShortageUnits(
  client: ShortageInboundClient,
  args: {
    orgId: OrgId;
    orderId: number;
    units: Array<{ unitId: number }>;
  },
): Promise<void> {
  if (args.units.length === 0) return;

  const open = await client.query<{ id: string; qty_short: string }>(
    `SELECT id, qty_short
       FROM order_line_shortages
      WHERE organization_id = $1 AND order_id = $2 AND status <> 'cleared'
      ORDER BY created_at ASC`,
    [args.orgId, args.orderId],
  );
  if (open.rows.length === 0) return;

  let remaining = args.units.slice();
  for (const shortage of open.rows) {
    if (remaining.length === 0) break;
    const need = Math.max(1, Math.floor(Number(shortage.qty_short) || 1));
    const take = remaining.splice(0, need);
    for (const unit of take) {
      await client.query(
        `INSERT INTO shortage_inbound_links (
           organization_id, shortage_id, source_kind, serial_unit_id, qty, link_status
         ) VALUES ($1, $2, 'serial_unit', $3, 1, 'allocated')
         ON CONFLICT DO NOTHING`,
        [args.orgId, shortage.id, unit.unitId],
      );
    }
    const allocatedCount = await client.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n
         FROM shortage_inbound_links
        WHERE organization_id = $1 AND shortage_id = $2 AND link_status = 'allocated'`,
      [args.orgId, shortage.id],
    );
    const n = Number(allocatedCount.rows[0]?.n ?? 0);
    if (n >= need) {
      await client.query(
        `UPDATE order_line_shortages
            SET status = 'cleared', cleared_at = NOW(), cleared_by = 'allocate'
          WHERE id = $1 AND organization_id = $2`,
        [shortage.id, args.orgId],
      );
    } else if (n > 0) {
      await client.query(
        `UPDATE order_line_shortages SET status = 'allocated' WHERE id = $1 AND organization_id = $2 AND status <> 'cleared'`,
        [shortage.id, args.orgId],
      );
    }
  }

  await syncOrderShortageDenorm(client, args.orgId, args.orderId);
}
