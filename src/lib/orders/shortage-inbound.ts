/** Earmark inbound / stocked units onto open order-line shortages. */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { syncOrderShortageDenorm } from '@/lib/orders/order-line-shortage';

type ShortageInboundClient = Pick<PoolClient, 'query'>;

/**
 * A replenishment became an inbound order: earmark every open shortage that
 * asked for it onto that order (and onto the order's line for the same
 * catalog item, when there is one) and move the shortages to `on_po`.
 * `zohoPoId` is only a fact carried along when the order was exported to Zoho.
 */
export async function earmarkPoForReplenishmentRequest(
  client: ShortageInboundClient,
  args: {
    orgId: OrgId;
    replenishmentRequestId: string;
    inboundOrderId?: number | null;
    zohoPoId?: string | null;
    zohoPoNumber?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO shortage_inbound_links (
       organization_id, shortage_id, source_kind, replenishment_request_id,
       zoho_po_id, inbound_order_id, receiving_line_id, qty, link_status
     )
     SELECT ols.organization_id, ols.id, 'po_line', $1, $2, $4,
            (SELECT rl.id FROM receiving_line rl
              WHERE rl.organization_id = ols.organization_id
                AND rl.inbound_order_id = $4
                AND rl.sku_catalog_id = ols.sku_catalog_id
              ORDER BY rl.id LIMIT 1),
            ols.qty_short, 'reserved'
       FROM order_line_shortages ols
      WHERE ols.organization_id = $3
        AND ols.replenishment_request_id = $1
        AND ols.status <> 'cleared'
     ON CONFLICT DO NOTHING`,
    [args.replenishmentRequestId, args.zohoPoId ?? null, args.orgId, args.inboundOrderId ?? null],
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

/**
 * Receiving lines were matched (in transit) or unboxed (received): hand their
 * quantity to the open shortages for the same catalog item.
 *
 * Identity: the line's `sku_catalog_id` (the internal item). During the Zoho
 * dual-key window a line that only carries a Zoho item id still matches
 * shortages on `zoho_item_id`.
 * Priority: shortages earmarked to this line or its inbound order first
 * (the order was bought for them), then the oldest shortage.
 * Quantity: the line's quantity is spread across shortages until it runs
 * out — one received line of 10 covers up to 10 short units, not one order.
 */
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

  const lines = await client.query<{
    receiving_line_id: number;
    inbound_order_id: number | null;
    sku_catalog_id: number | null;
    zoho_item_id: string | null;
    qty: number | null;
  }>(
    `SELECT rl.id AS receiving_line_id,
            rl.inbound_order_id,
            rl.sku_catalog_id,
            NULLIF(btrim(rz.zoho_item_id), '') AS zoho_item_id,
            COALESCE(NULLIF(rl.quantity_received, 0), rl.quantity_expected, 1)::int AS qty
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
      WHERE rl.id = ANY($1::int[])
        AND rl.organization_id = $2`,
    [args.receivingLineIds, args.orgId],
  );

  for (const line of lines.rows) {
    if (line.sku_catalog_id == null && !line.zoho_item_id) continue;
    let remaining = Math.max(1, Number(line.qty) || 1);

    // Units this line already committed (a re-match must not double-count).
    const already = await client.query<{ shortage_id: string; qty: string }>(
      `SELECT shortage_id, qty FROM shortage_inbound_links
        WHERE organization_id = $1 AND receiving_line_id = $2 AND link_status <> 'released'`,
      [args.orgId, line.receiving_line_id],
    );
    for (const link of already.rows) remaining -= Number(link.qty) || 0;

    const candidates = await client.query<{ id: string; qty_short: string; earmarked: boolean }>(
      `SELECT ols.id, ols.qty_short,
              EXISTS (SELECT 1 FROM shortage_inbound_links sil
                       WHERE sil.organization_id = ols.organization_id AND sil.shortage_id = ols.id
                         AND sil.link_status <> 'released'
                         AND (sil.receiving_line_id = $4 OR ($5::bigint IS NOT NULL AND sil.inbound_order_id = $5))
                     ) AS earmarked
         FROM order_line_shortages ols
        WHERE ols.organization_id = $1
          AND ols.status NOT IN ('cleared', 'allocated')
          AND (($2::int IS NOT NULL AND ols.sku_catalog_id = $2)
               OR ($3::text IS NOT NULL AND ols.zoho_item_id = $3))
        ORDER BY earmarked DESC, ols.created_at ASC`,
      [args.orgId, line.sku_catalog_id, line.zoho_item_id, line.receiving_line_id, line.inbound_order_id],
    );

    const covered = new Set(already.rows.map((l) => l.shortage_id));
    for (const shortage of candidates.rows) {
      if (covered.has(shortage.id)) {
        await client.query(
          `UPDATE shortage_inbound_links SET link_status = $4, updated_at = NOW()
            WHERE organization_id = $1 AND shortage_id = $2 AND receiving_line_id = $3`,
          [args.orgId, shortage.id, line.receiving_line_id, linkStatus],
        );
      } else {
        if (remaining <= 0) continue;
        const take = Math.min(remaining, Math.max(1, Number(shortage.qty_short) || 1));
        remaining -= take;
        await client.query(
          `INSERT INTO shortage_inbound_links (
             organization_id, shortage_id, source_kind, receiving_line_id, inbound_order_id, qty, link_status
           ) VALUES ($1, $2, 'receiving_line', $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [args.orgId, shortage.id, line.receiving_line_id, line.inbound_order_id, take, linkStatus],
        );
      }
      await client.query(
        `UPDATE order_line_shortages
            SET status = $3
          WHERE id = $1 AND organization_id = $2 AND status <> 'cleared' AND status <> 'allocated'`,
        [shortage.id, args.orgId, shortageStatus],
      );
    }
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
