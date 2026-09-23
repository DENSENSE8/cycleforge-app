import pool from '@/lib/db';
import { createStationActivityLog } from '@/lib/station-activity';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import type { DockStagingCandidate } from '@/lib/outbound/dock-staging-contract';

export { normalizeDockLocation } from '@/lib/outbound/dock-staging-contract';

const shippedByCarrierOrLatestStatusSql = SHIPPED_BY_CARRIER_SQL;

/** Packed, unshipped cartons split by whether a physical dock location was recorded. */
export async function listDockStagingCandidates(
  organizationId: number | string,
  state: 'pending' | 'staged',
): Promise<DockStagingCandidate[]> {
  const stagedPredicate = state === 'staged' ? 'EXISTS' : 'NOT EXISTS';
  const result = await pool.query(
    `SELECT DISTINCT ON (o.shipment_id)
            o.id,
            o.shipment_id,
            o.order_id,
            o.product_title,
            o.sku,
            o.item_number,
            stn.tracking_number_raw AS shipping_tracking_number,
            o.quantity,
            sc.image_url,
            stage.metadata->>'location_code' AS location_code,
            stage.created_at AS staged_at
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
       LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
       LEFT JOIN LATERAL (
         SELECT sal.metadata, sal.created_at
           FROM station_activity_logs sal
          WHERE sal.organization_id = o.organization_id
            AND sal.shipment_id = o.shipment_id
            AND sal.activity_type = 'DOCK_STAGED'
          ORDER BY sal.created_at DESC
          LIMIT 1
       ) stage ON TRUE
      WHERE o.organization_id = $1
        AND o.shipment_id IS NOT NULL
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT ${shippedByCarrierOrLatestStatusSql}
        AND EXISTS (
          SELECT 1 FROM station_activity_logs sal_pack
           WHERE sal_pack.organization_id = o.organization_id
             AND sal_pack.shipment_id = o.shipment_id
             AND sal_pack.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
        )
        AND NOT EXISTS (
          SELECT 1 FROM station_activity_logs sal_out
           WHERE sal_out.organization_id = o.organization_id
             AND sal_out.shipment_id = o.shipment_id
             AND sal_out.activity_type = 'SHIP_CONFIRM'
        )
        AND ${stagedPredicate} (
          SELECT 1 FROM station_activity_logs sal_stage
           WHERE sal_stage.organization_id = o.organization_id
             AND sal_stage.shipment_id = o.shipment_id
             AND sal_stage.activity_type = 'DOCK_STAGED'
        )
      ORDER BY o.shipment_id, o.id DESC`,
    [organizationId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    shipmentId: Number(row.shipment_id),
    orderId: String(row.order_id || row.id),
    productTitle: String(row.product_title || row.order_id || 'Packed order'),
    sku: row.sku ? String(row.sku) : null,
    itemNumber: row.item_number ? String(row.item_number) : null,
    tracking: row.shipping_tracking_number ? String(row.shipping_tracking_number) : null,
    quantity: row.quantity == null ? null : Number(row.quantity),
    imageUrl: row.image_url ? String(row.image_url) : null,
    locationCode: row.location_code ? String(row.location_code) : null,
    stagedAt: row.staged_at ? new Date(row.staged_at).toISOString() : null,
  }));
}

/** Shipment ids: packed, not scanned out, not carrier-shipped — dock-staging candidates. */
export async function listDockStagingCandidateShipmentIds(
  organizationId: number | string,
): Promise<number[]> {
  const result = await pool.query<{ shipment_id: number }>(
    `SELECT DISTINCT o.shipment_id
       FROM orders o
      WHERE o.organization_id = $1
        AND o.shipment_id IS NOT NULL
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT ${shippedByCarrierOrLatestStatusSql}
        AND EXISTS (
          SELECT 1 FROM station_activity_logs sal_pack
           WHERE sal_pack.shipment_id = o.shipment_id
             AND sal_pack.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
        )
        AND NOT EXISTS (
          SELECT 1 FROM station_activity_logs sal_out
           WHERE sal_out.shipment_id = o.shipment_id
             AND sal_out.activity_type = 'SHIP_CONFIRM'
        )
        AND NOT EXISTS (
          SELECT 1 FROM station_activity_logs sal_stage
           WHERE sal_stage.shipment_id = o.shipment_id
             AND sal_stage.activity_type = 'DOCK_STAGED'
        )`,
    [organizationId],
  );
  return result.rows
    .map((row) => Number(row.shipment_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export async function resolveStaffIdByName(
  organizationId: number | string,
  name: string,
): Promise<number | null> {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const result = await pool.query<{ id: number }>(
    `SELECT id
       FROM staff
      WHERE organization_id = $1
        AND lower(trim(name)) = lower($2)
      ORDER BY id ASC
      LIMIT 1`,
    [organizationId, trimmed],
  );
  const id = Number(result.rows[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function markShipmentsDockStaged(
  organizationId: number | string,
  staffId: number,
  shipmentIds: number[],
  options: { locationCode?: string | null; source?: string } = {},
): Promise<number> {
  if (shipmentIds.length === 0) return 0;

  let inserted = 0;
  for (const shipmentId of shipmentIds) {
    const existing = await pool.query(
      `SELECT id
         FROM station_activity_logs
        WHERE organization_id = $1
          AND shipment_id = $2
          AND activity_type = 'DOCK_STAGED'
        LIMIT 1`,
      [organizationId, shipmentId],
    );
    if (existing.rows[0]) continue;

    await createStationActivityLog(pool, {
      organizationId: String(organizationId),
      station: 'OUTBOUND',
      activityType: 'DOCK_STAGED',
      staffId,
      shipmentId,
      metadata: {
        source: options.source ?? 'outbound.mark-staged',
        ...(options.locationCode ? { location_code: options.locationCode } : {}),
      },
    });
    inserted += 1;
  }
  return inserted;
}
