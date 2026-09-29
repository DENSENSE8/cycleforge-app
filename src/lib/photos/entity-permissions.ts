import { ApiError } from '@/lib/api';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import { PHOTO_ENTITY_TYPES, type PhotoEntityType } from './types';

/** Upload/delete permission for each photo entity type. */
const UPLOAD_PERM_BY_ENTITY: Record<PhotoEntityType, PermissionString> = {
  RECEIVING: 'receiving.upload_photo',
  RECEIVING_LINE: 'receiving.upload_photo',
  PACKER_LOG: 'packing.complete_order',
  SERIAL_UNIT: 'tech.scan_serial',
  ORDER: 'orders.create',
  SKU: 'receiving.upload_photo',
  SKU_STOCK: 'sku_stock.adjust',
  BIN_ADJUSTMENT: 'bin.adjust',
  SHARE_PACK: 'photos.share',
  ZENDESK_TICKET: 'integrations.zendesk',
  // Repair evidence is "internal insurance":
  REPAIR_SERVICE: 'repair.intake',
  // Deliberately the ADMIN perm, not an "everyone" gate:
  STAFF: 'admin.manage_staff',
  // Task media rides the SAME gate as throwing and driving a task: every floor
  // role holds it, and the upload routes additionally require the id to be a
  // FOLLOW_UP task in the caller's org (`assertTaskInOrg`).
  WORK_ASSIGNMENT: 'work_orders.claim',
};

export function uploadPermissionFor(entityType: PhotoEntityType): PermissionString {
  return UPLOAD_PERM_BY_ENTITY[entityType];
}

/** The entity a media upload targets, parsed off the request exactly one way for photos (`POST /api/photos/upload`) and videos (`POST… */
export function parseMediaEntityTarget(
  rawType: unknown,
  rawId: unknown,
): { entityType: PhotoEntityType; entityId: number } {
  const entityType = String(rawType || '').trim().toUpperCase();
  if (!PHOTO_ENTITY_TYPES.includes(entityType as PhotoEntityType)) {
    throw ApiError.badRequest(`Invalid entityType: ${entityType}`);
  }
  const entityId = Number(rawId);
  if (!Number.isFinite(entityId) || entityId <= 0) {
    throw ApiError.badRequest('Valid entityId is required');
  }
  return { entityType: entityType as PhotoEntityType, entityId };
}
