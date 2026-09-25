import { ApiError } from '@/lib/api';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import { PHOTO_ENTITY_TYPES, type PhotoEntityType } from './types';

/** Upload/delete permission for each photo entity type. */
export const UPLOAD_PERM_BY_ENTITY: Record<PhotoEntityType, PermissionString> = {
  RECEIVING: 'receiving.upload_photo',
  RECEIVING_LINE: 'receiving.upload_photo',
  PACKER_LOG: 'packing.complete_order',
  SERIAL_UNIT: 'tech.scan_serial',
  SKU: 'receiving.upload_photo',
  SKU_STOCK: 'sku_stock.adjust',
  BIN_ADJUSTMENT: 'bin.adjust',
  SHARE_PACK: 'photos.share',
  ZENDESK_TICKET: 'integrations.zendesk',
  // Repair evidence is "internal insurance": attached at counter intake
  // (drop-off condition photos) and by the tech closing the loop. Gate rides
  // the repair family's intake verb — the same staff who create the repair
  // line are the ones photographing the device. Tighten to a dedicated
  // `repair.upload_photo` permission if techs end up blocked in practice.
  REPAIR_SERVICE: 'repair.intake',
  // Deliberately the ADMIN perm, not an "everyone" gate: this table answers
  // "may I upload to someone else's scope". A staffer setting their OWN photo
  // goes through /api/staff/[id]/avatar, which checks `id === ctx.staffId`
  // first and only falls back to this permission for the admin-on-behalf case.
  // Leaving it open here would let the generic /api/photos/upload route attach
  // a photo to any colleague's profile.
  STAFF: 'admin.manage_staff',
  // Task media rides the SAME gate as throwing and driving a task: every floor
  // role holds it, and the upload routes additionally require the id to be a
  // FOLLOW_UP task in the caller's org (`assertTaskInOrg`).
  WORK_ASSIGNMENT: 'work_orders.claim',
};

export function uploadPermissionFor(entityType: PhotoEntityType): PermissionString {
  return UPLOAD_PERM_BY_ENTITY[entityType];
}

/**
 * The entity a media upload targets, parsed off the request exactly one way for
 * photos (`POST /api/photos/upload`) and videos (`POST /api/photos/upload/video`):
 * a known `PHOTO_ENTITY_TYPES` value (case-insensitive) and a positive id.
 * Gate the result with {@link uploadPermissionFor}.
 */
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
