import type { PhotoEntityType } from '../types';

/** Build GCS object keys under `{org}/{flow}/…/{photoId}.jpg`. */
export function buildGcsObjectKey(opts: {
  organizationId: string;
  entityType: PhotoEntityType;
  photoId: number;
  /**
   * The polymorphic parent id. Only STAFF (`staff/{id}/avatar/…`) and
   * WORK_ASSIGNMENT (`tasks/{id}/…`) file under it today — every other flow
   * partitions by date, PO, or unit uid, so passing it is optional and ignored elsewhere.
   */
  entityId?: number | null;
  poRef?: string | null;
  unitUid?: string | null;
  /**
   * Custom image-type GCS prefix (see `lib/photos/image-types.ts`). When set it
   * REPLACES the entity-derived flow: `{org}/{prefix}/{yyyy}/{mm}/[PO-{po}/]{id}.jpg`.
   * Built-in types pass it undefined and keep their existing layout.
   */
  prefix?: string | null;
  now?: Date;
}): { objectKey: string; thumbObjectKey: string } {
  const now = opts.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const baseName = `${opts.photoId}.jpg`;

  // Custom image type → its own bucket path, date-partitioned, PO segment only
  // when the photo carries a poRef.
  const customPrefix = opts.prefix ? sanitizePathSegment(opts.prefix) : null;
  if (customPrefix) {
    const poSeg = opts.poRef ? `PO-${sanitizePathSegment(opts.poRef)}/` : '';
    const segment = `${customPrefix}/${yyyy}/${mm}/${poSeg}${baseName}`;
    const prefix = opts.organizationId;
    return {
      objectKey: `${prefix}/${segment}`,
      thumbObjectKey: `${prefix}/${segment.replace(/\.jpg$/i, '_thumb.jpg')}`,
    };
  }

  const segment = `${entityFlowDirectory({ ...opts, fallbackId: opts.photoId, now })}/${baseName}`;

  const prefix = opts.organizationId;
  const objectKey = `${prefix}/${segment}`;
  const thumbSegment = segment.replace(/\.jpg$/i, '_thumb.jpg');
  return { objectKey, thumbObjectKey: `${prefix}/${thumbSegment}` };
}

/**
 * Object key for an entity video: `{org}/videos/{flow}/{videoId}.{ext}`, where
 * `{flow}` is the SAME entity directory a photo of that entity files under
 * (see {@link entityFlowDirectory}), so an entity's videos sit beside its photos
 * one `videos/` level down. Videos have no thumbnail object.
 */
export function buildGcsVideoObjectKey(opts: {
  organizationId: string;
  entityType: PhotoEntityType;
  entityId: number;
  videoId: number;
  /** Canonical container extension (`VIDEO_MIME_EXTENSIONS`), no dot. */
  extension: string;
  poRef?: string | null;
  unitUid?: string | null;
  now?: Date;
}): string {
  const flow = entityFlowDirectory({ ...opts, fallbackId: opts.videoId, now: opts.now ?? new Date() });
  return `${opts.organizationId}/videos/${flow}/${opts.videoId}.${sanitizePathSegment(opts.extension)}`;
}

/**
 * The per-entity directory under the org root — one switch shared by photo and
 * video keys so both media kinds of one entity always route to the same place.
 * `fallbackId` names the serial-unit / staff folder when the entity's own key
 * (unit uid / entity id) is absent — the media id, as photos always did.
 */
function entityFlowDirectory(opts: {
  entityType: PhotoEntityType;
  entityId?: number | null;
  poRef?: string | null;
  unitUid?: string | null;
  fallbackId: number;
  now: Date;
}): string {
  const yyyy = String(opts.now.getUTCFullYear());
  const mm = String(opts.now.getUTCMonth() + 1).padStart(2, '0');
  const safePo = sanitizePathSegment(opts.poRef || 'unknown');
  switch (opts.entityType) {
    case 'RECEIVING':
    case 'RECEIVING_LINE':
      return `receiving/${yyyy}/${mm}/PO-${safePo}`;
    case 'PACKER_LOG':
      return `packing/${yyyy}/${mm}/PO-${safePo}`;
    case 'SERIAL_UNIT':
      return `serial-units/${sanitizePathSegment(opts.unitUid || String(opts.fallbackId))}`;
    case 'STAFF':
      // Person-partitioned, not date-partitioned: a profile photo is replaced
      // in place over a career, so grouping by staffer keeps every version of
      // one face in one prefix instead of scattered across months.
      return `staff/${sanitizePathSegment(String(opts.entityId ?? opts.fallbackId))}/avatar`;
    case 'WORK_ASSIGNMENT':
      // Task-partitioned: a task's evidence accrues over its whole life, so
      // one prefix per task keeps it together across months.
      return `tasks/${sanitizePathSegment(String(opts.entityId ?? opts.fallbackId))}`;
    default:
      return `misc/${yyyy}/${mm}`;
  }
}

function sanitizePathSegment(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'unknown';
}
