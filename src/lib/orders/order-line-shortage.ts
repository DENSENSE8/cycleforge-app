/**
 * Persist order_line_shortages and keep orders.is_out_of_stock + oos_* in sync.
 * Callers: POST /api/orders/assign, POST /api/orders/missing-parts.
 * Schema: order_line_shortages, orders.oos_*, shortage_inbound_links (release on clear).
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  shortageIdentityToPayload,
  shortageZohoKey,
  type OrderShortageIdentity,
} from '@/lib/orders/order-shortage-identity';
import { readShortageSchema } from '@/lib/orders/shortage-schema';

type ShortageWriteClient = Pick<PoolClient, 'query'>;

export async function upsertOrderLineShortage(
  client: ShortageWriteClient,
  args: {
    orgId: OrgId;
    orderId: number;
    identity: OrderShortageIdentity;
    createdBy?: string | null;
  },
): Promise<{ shortageId: string }> {
  const schema = await readShortageSchema(client);
  if (!schema.tables) return { shortageId: '' };

  const payload = shortageIdentityToPayload(args.identity);
  const zohoKey = shortageZohoKey(args.identity);
  const qty = args.identity.qtyShort > 0 ? args.identity.qtyShort : 1;

  const orderQ = await client.query<{ order_id: string | null }>(
    `SELECT order_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [args.orderId, args.orgId],
  );

  // The internal catalog item is the shortage's identity; a Zoho-only
  // identity is resolved through the crosswalk (dual-key window).
  let skuCatalogId = payload.oosSkuCatalogId ?? null;
  if (skuCatalogId == null && zohoKey) {
    const hit = await client.query<{ sku_catalog_id: number }>(
      `SELECT sku_catalog_id FROM catalog_external_ids
        WHERE organization_id = $1 AND provider = 'zoho' AND external_id = $2 LIMIT 1`,
      [args.orgId, zohoKey],
    );
    skuCatalogId = hit.rows[0]?.sku_catalog_id ?? null;
  }
  const conflictTarget = skuCatalogId != null
    ? `(organization_id, order_id, sku_catalog_id) WHERE status <> 'cleared' AND sku_catalog_id IS NOT NULL`
    : `(organization_id, order_id, zoho_item_id) WHERE status <> 'cleared'`;

  const upsert = await client.query<{ id: string }>(
    `INSERT INTO order_line_shortages (
       organization_id, order_id, commercial_order_id, zoho_item_id, item_id,
       sku_catalog_id, kit_part_id, kind, qty_short, title, sku, status, created_by
     ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, 'open', $12)
     ON CONFLICT ${conflictTarget}
     DO UPDATE SET
       item_id = COALESCE(EXCLUDED.item_id, order_line_shortages.item_id),
       zoho_item_id = COALESCE(EXCLUDED.zoho_item_id, order_line_shortages.zoho_item_id),
       sku_catalog_id = COALESCE(EXCLUDED.sku_catalog_id, order_line_shortages.sku_catalog_id),
       kit_part_id = COALESCE(EXCLUDED.kit_part_id, order_line_shortages.kit_part_id),
       kind = EXCLUDED.kind,
       qty_short = EXCLUDED.qty_short,
       title = EXCLUDED.title,
       sku = EXCLUDED.sku
     RETURNING id`,
    [
      args.orgId,
      args.orderId,
      orderQ.rows[0]?.order_id ?? null,
      zohoKey,
      payload.oosItemId,
      skuCatalogId,
      payload.oosKitPartId,
      payload.oosKind,
      qty,
      payload.oosTitle,
      payload.oosSku,
      args.createdBy ?? 'staff',
    ],
  );

  await syncOrderShortageDenorm(client, args.orgId, args.orderId);
  return { shortageId: String(upsert.rows[0]?.id) };
}

export async function clearOrderLineShortages(
  client: ShortageWriteClient,
  args: {
    orgId: OrgId;
    orderId: number;
    clearedBy?: string | null;
  },
): Promise<string[]> {
  const schema = await readShortageSchema(client);
  if (!schema.tables) return [];

  await client.query(
    `UPDATE shortage_inbound_links sil
        SET link_status = 'released', updated_at = NOW()
      WHERE sil.organization_id = $1
        AND sil.link_status <> 'released'
        AND sil.shortage_id IN (
          SELECT id FROM order_line_shortages
           WHERE organization_id = $1 AND order_id = $2 AND status <> 'cleared'
        )`,
    [args.orgId, args.orderId],
  );

  const cleared = await client.query<{ id: string }>(
    `UPDATE order_line_shortages
        SET status = 'cleared',
            cleared_at = NOW(),
            cleared_by = $3
      WHERE organization_id = $1
        AND order_id = $2
        AND status <> 'cleared'
      RETURNING id`,
    [args.orgId, args.orderId, args.clearedBy ?? 'staff'],
  );

  await syncOrderShortageDenorm(client, args.orgId, args.orderId);
  return cleared.rows.map((r) => String(r.id));
}

/**
 * Undo a clear: re-open shortages {@link clearOrderLineShortages} closed (by
 * the ids it returned) and re-sync each order's out-of-stock denorm. A line
 * that meanwhile got a NEW open shortage is left cleared (one open row per
 * line). Released inbound links stay released — re-pair them on the order.
 */
export async function reopenOrderLineShortages(
  client: ShortageWriteClient,
  args: { orgId: OrgId; shortageIds: readonly string[] },
): Promise<number[]> {
  if (args.shortageIds.length === 0) return [];
  const reopened = await client.query<{ order_id: number }>(
    `UPDATE order_line_shortages s
        SET status = 'open', cleared_at = NULL, cleared_by = NULL
      WHERE s.organization_id = $1
        AND s.id::text = ANY($2::text[])
        AND s.status = 'cleared'
        AND NOT EXISTS (
          SELECT 1 FROM order_line_shortages o
           WHERE o.organization_id = s.organization_id AND o.order_id = s.order_id
             AND o.zoho_item_id IS NOT DISTINCT FROM s.zoho_item_id AND o.status <> 'cleared')
      RETURNING s.order_id`,
    [args.orgId, [...args.shortageIds]],
  );
  const orderIds = [...new Set(reopened.rows.map((r) => Number(r.order_id)))];
  for (const orderId of orderIds) await syncOrderShortageDenorm(client, args.orgId, orderId);
  return orderIds;
}

export async function syncOrderShortageDenorm(
  client: ShortageWriteClient,
  orgId: OrgId,
  orderId: number,
): Promise<void> {
  const schema = await readShortageSchema(client);
  if (!schema.tables) return;

  const open = await client.query<{
    kind: string;
    sku: string | null;
    sku_catalog_id: number | null;
    kit_part_id: number | null;
    qty_short: string | number | null;
    title: string | null;
    zoho_item_id: string | null;
  }>(
    `SELECT kind, sku, sku_catalog_id, kit_part_id, qty_short, title, zoho_item_id
       FROM order_line_shortages
      WHERE organization_id = $1 AND order_id = $2 AND status <> 'cleared'
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId, orderId],
  );
  const row = open.rows[0];
  if (!row) {
    await client.query(
      `UPDATE orders SET
         is_out_of_stock = false,
         oos_kind = NULL,
         oos_sku = NULL,
         oos_sku_catalog_id = NULL,
         oos_kit_part_id = NULL,
         oos_qty_short = NULL,
         oos_title = NULL
         ${schema.oosZohoColumn ? ', oos_zoho_item_id = NULL' : ''}
       WHERE id = $1 AND organization_id = $2`,
      [orderId, orgId],
    );
    return;
  }

  await client.query(
    `UPDATE orders SET
       is_out_of_stock = true,
       oos_kind = $3,
       oos_sku = $4,
       oos_sku_catalog_id = $5,
       oos_kit_part_id = $6,
       oos_qty_short = $7,
       oos_title = $8
       ${schema.oosZohoColumn ? ', oos_zoho_item_id = $9' : ''}
     WHERE id = $1 AND organization_id = $2`,
    schema.oosZohoColumn
      ? [
          orderId,
          orgId,
          row.kind,
          row.sku,
          row.sku_catalog_id,
          row.kit_part_id,
          row.qty_short ?? 1,
          row.title,
          row.zoho_item_id,
        ]
      : [
          orderId,
          orgId,
          row.kind,
          row.sku,
          row.sku_catalog_id,
          row.kit_part_id,
          row.qty_short ?? 1,
          row.title,
        ],
  );
}

export async function attachShortageReplenishment(
  client: ShortageWriteClient,
  args: { orgId: OrgId; orderId: number; replenishmentRequestId: string },
): Promise<void> {
  const schema = await readShortageSchema(client);
  if (!schema.tables) return;

  await client.query(
    `UPDATE order_line_shortages
        SET replenishment_request_id = $3
      WHERE organization_id = $1
        AND order_id = $2
        AND status <> 'cleared'
        AND replenishment_request_id IS NULL`,
    [args.orgId, args.orderId, args.replenishmentRequestId],
  );
}
