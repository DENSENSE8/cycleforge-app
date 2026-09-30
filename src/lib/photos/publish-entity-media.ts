import {
  publishPackerPhotoChanged,
  publishReceivingPhotoChanged,
  publishRepairChanged,
  publishSkuExceptionChanged,
  publishSkuStockPhotoChanged,
  publishUnitPhotoChanged,
} from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { countPackerPhotos } from './queries/packer-list';
import { countReceivingPhotos } from './queries/receiving-list';
import { countUnitPhotos } from './queries/unit-list';
import type { PhotoEntityType } from './types';

/** Announce new media (a photo or a video) on its entity's realtime channel — the ONE per-entity dispatch shared by `POST… */
export async function publishEntityMediaInsert(input: {
  organizationId: string;
  entityType: PhotoEntityType;
  entityId: number;
  /** PACKER_LOG only: the order the packer's shot belongs to. */
  orderId?: string | null;
  photoId: number | null;
  source: string;
}): Promise<{ receivingId: number | null }> {
  const { organizationId, entityType, entityId, photoId, source } = input;
  const orgId = organizationId as OrgId;

  if (entityType === 'RECEIVING' || entityType === 'RECEIVING_LINE') {
    const receivingId =
      entityType === 'RECEIVING' ? entityId : await resolveReceivingId(entityId, organizationId);
    if (receivingId) {
      await publishReceivingPhotoChanged({
        organizationId: orgId,
        action: 'insert',
        receivingId,
        receivingLineId: entityType === 'RECEIVING_LINE' ? entityId : null,
        photoId,
        totalPhotoCount: await countReceivingPhotos(organizationId, receivingId),
        source,
      });
    }
    return { receivingId };
  }
  if (entityType === 'PACKER_LOG') {
    await publishPackerPhotoChanged({
      organizationId: orgId,
      action: 'insert',
      packerLogId: entityId,
      orderId: input.orderId ?? null,
      photoId,
      totalPhotoCount: await countPackerPhotos(organizationId, entityId),
      source,
    });
  } else if (entityType === 'SERIAL_UNIT') {
    await publishUnitPhotoChanged({
      organizationId: orgId,
      action: 'insert',
      serialUnitId: entityId,
      photoId,
      totalPhotoCount: await countUnitPhotos(organizationId, entityId),
      source,
    });
  } else if (entityType === 'REPAIR_SERVICE') {
    // Repair evidence rides the repair channel, not a photo channel: the
    // /m/rs/{id} page and every repair desk surface already revalidate on
    // repair.changed, so the Photos screen paints live.
    await publishRepairChanged({ organizationId: orgId, repairIds: [entityId], source });
  } else if (entityType === 'SKU_STOCK') {
    await publishSkuStockMediaChanged(organizationId, entityId, 'insert', source);
  }
  return { receivingId: null };
}

/**
 * A photo added to / removed from a `sku_stock` row. Every row announces
 * `sku-stock-photo.changed` (the desk stock record repaints); a placeholder
 * (SKU exception) row also announces `sku-exception.changed` for its hub.
 */
export async function publishSkuStockMediaChanged(
  organizationId: string,
  stockId: number,
  action: 'insert' | 'delete',
  source: string,
): Promise<void> {
  const r = await tenantQuery<{ sku: string; is_provisional: boolean }>(
    organizationId,
    `SELECT sku, is_provisional FROM sku_stock WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [stockId, organizationId],
  );
  const row = r.rows[0];
  if (!row?.sku) return;
  await publishSkuStockPhotoChanged({ organizationId, action, stockId, sku: row.sku, source });
  if (row.is_provisional) {
    await publishSkuExceptionChanged({ organizationId, sku: row.sku, action: 'photo', source });
  }
}

async function resolveReceivingId(lineId: number, organizationId: string): Promise<number | null> {
  const r = await tenantQuery<{ receiving_id: number }>(
    organizationId,
    `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [lineId, organizationId],
  );
  return r.rows[0]?.receiving_id ?? null;
}
