/** Shared photo platform types — entity linkage, storage, and API contracts. */

import type { PhotoAspect } from './photo-aspects';

export const PHOTO_ENTITY_TYPES = [
  'RECEIVING',
  'RECEIVING_LINE',
  'PACKER_LOG',
  'SERIAL_UNIT',
  'SKU',
  'SKU_STOCK',
  'BIN_ADJUSTMENT',
  'SHARE_PACK',
  'ZENDESK_TICKET',
  'REPAIR_SERVICE',
  'STAFF',
  // A thrown FOLLOW_UP task (`work_assignments`) — the task desk's evidence.
  'WORK_ASSIGNMENT',
] as const;

export type PhotoEntityType = (typeof PHOTO_ENTITY_TYPES)[number];

export const PHOTO_LINK_ROLES = ['primary', 'claim_evidence', 'insurance_share'] as const;
export type PhotoLinkRole = (typeof PHOTO_LINK_ROLES)[number];

/**
 * `photo_type` for a testing-label scan photo (operator scans a printed unit
 * label at the testing station → phone captures photos linked to the
 * SERIAL_UNIT). Distinct from receiving and packing so buckets never collide.
 */
export const UNIT_TESTING_PHOTO_TYPE = 'testing_photo';

/**
 * `photo_type` for pack-station captures linked to a SERIAL_UNIT (and optionally
 * dual-linked to PACKER_LOG). Canonical SoT for shipout/pack-at-unit photos —
 * never use free-text `shipout` as photo_type; map stage → this constant.
 */
export const UNIT_PACKING_PHOTO_TYPE = 'packer_photo';

/** `photo_type`s for the guided Packer Review capture (two-step slip → box) on `/m/pack` (docs/todo/packer-review-station-plan.md §2a). */
export const PACK_SLIP_PHOTO_TYPE = 'pack_slip';
export const PACK_BOX_PHOTO_TYPE = 'pack_box';

/**
 * `photo_type` for verify-before-pack captures that are still unit-scoped
 * (the serial-units photo POST `prepack` stage).
 */
export const UNIT_PREPACK_PHOTO_TYPE = 'prepack';

/**
 * `photo_type` for box-label shots the packing routes attach to a PACKER_LOG.
 */
export const PACKER_BOX_LABEL_PHOTO_TYPE = 'box_label';

/** `photo_type` for a staff profile photo (entity_type `STAFF`). */
export const STAFF_AVATAR_PHOTO_TYPE = 'staff_avatar';

/**
 * Resolve the serial-units photo POST `stage` body field → canonical photo_type.
 * `shipout` (default) → packer_photo; `prepack` kept as a free-text stage label
 * for verify-before-pack captures that are still unit-scoped.
 */
export function resolveUnitPhotoTypeFromStage(stage: string | null | undefined): string {
  const s = String(stage || 'shipout').trim().toLowerCase() || 'shipout';
  if (s === 'shipout' || s === 'pack' || s === 'packing') return UNIT_PACKING_PHOTO_TYPE;
  if (s === UNIT_PREPACK_PHOTO_TYPE) return UNIT_PREPACK_PHOTO_TYPE;
  if (s === 'testing' || s === UNIT_TESTING_PHOTO_TYPE) return UNIT_TESTING_PHOTO_TYPE;
  return UNIT_PACKING_PHOTO_TYPE;
}

export const PHOTO_STORAGE_PROVIDERS = [
  'gcs',
  'vercel_blob',
  'nas',
  'legacy_url',
  's3',
  'r2',
  'google_drive',
] as const;

export type PhotoStorageProvider = (typeof PHOTO_STORAGE_PROVIDERS)[number];

export interface PhotoRecord {
  id: number;
  organizationId: string;
  photoType: string | null;
  takenByStaffId: number | null;
  poRef: string | null;
  url: string | null;
  createdAt: string;
}

export interface PhotoListItem extends PhotoRecord {
  /** Resolved display URL — content route or legacy normalized URL. */
  displayUrl: string;
  thumbUrl: string;
}

export interface UploadPhotoInput {
  organizationId: string;
  staffId: number;
  entityType: PhotoEntityType;
  entityId: number;
  photoType?: string | null;
  linkRole?: PhotoLinkRole;
  poRef?: string | null;
  fileBuffer: Buffer;
  contentType: string;
  /** When false, skip GCS and use legacy URL-only insert (migration period). */
  useStorageAdapter?: boolean;
  /** Legacy NAS/Blob URL when not uploading bytes server-side. */
  legacyUrl?: string | null;
  /** Device-reported capture instant → `photos.client_captured_at`. */
  clientCapturedAt?: Date | null;
  /** What this shot SHOWS, within its stage (`./photo-aspects.ts`). */
  photoAspect?: PhotoAspect | null;
}

export interface UploadPhotoResult {
  id: number;
  url: string;
  thumbUrl: string;
}
