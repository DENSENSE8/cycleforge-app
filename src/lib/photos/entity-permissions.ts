import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { PhotoEntityType } from './types';

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
};

export function uploadPermissionFor(entityType: PhotoEntityType): PermissionString {
  return UPLOAD_PERM_BY_ENTITY[entityType];
}
