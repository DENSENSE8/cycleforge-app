import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import {
  findPhotoByEntityLegacyUrl,
  insertPhotoCatalog,
  photoDisplayUrls,
} from './create-photo';
import { createPhotoEntityLink } from './links';
import { resolvePoRef } from './resolve-po-ref';
import {
  buildListForEntityQuery,
  mapPhotoRow,
  PHOTO_SELECT,
  type DbPhotoRow,
  type ListForEntityInput,
} from './queries/list-for-entity';
import { buildGcsObjectKey } from './storage/path-builder';
import { resolveGcsPrefix } from './image-types';
import { gcsAdapter, isGcsConfigured, resolveGcsBucket } from './storage/gcs-adapter';
import { getDefaultStorageProvider } from './storage/resolve-primary';
import { getStorageAdapter, isAdapterUploadEnabled } from './storage/registry';
import { generateThumbnail, sha256Hex } from './read-bytes';
import type {
  PhotoEntityType,
  PhotoLinkRole,
  UploadPhotoInput,
  UploadPhotoResult,
} from './types';
import pool from '@/lib/db';
import { del as delBlob } from '@vercel/blob';
import { enqueuePhotoJob } from './jobs';
import { isAnalyzeOnUploadEnabled } from './analyze';
import { validatePhotoWrite } from './stages';
import type { PhotoAspect } from './photo-aspects';
import { ApiError } from '@/lib/api';

const MAX_BYTES = Number(process.env.PHOTOS_UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
const THUMB_MAX_PX = Number(process.env.PHOTOS_THUMB_MAX_PX || 256);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface LinkPhotoInput {
  organizationId: string;
  photoId: number;
  entityType: PhotoEntityType;
  entityId: number;
  linkRole: PhotoLinkRole;
}

interface AttachLegacyPhotoInput {
  organizationId: string;
  staffId: number | null;
  entityType: PhotoEntityType;
  entityId: number;
  legacyUrl: string;
  photoType?: string | null;
  poRef?: string | null;
  linkRole?: PhotoLinkRole;
  contentType?: string;
  /** When true, return existing id instead of throwing on duplicate URL. */
  idempotent?: boolean;
  /** Device-reported capture instant → `photos.client_captured_at` (see `./capture-provenance.ts`). */
  clientCapturedAt?: Date | null;
  /** What this shot SHOWS, within its stage (`./photo-aspects.ts`). */
  photoAspect?: PhotoAspect | null;
}

/** Write waist for the stage × entity matrix (`./stages.ts`): */
function assertPhotoWriteAllowed(
  entityType: PhotoEntityType,
  photoType: string | null | undefined,
): void {
  const violation = validatePhotoWrite({ entityType, photoType });
  if (violation) throw ApiError.badRequest(violation);
}

export async function uploadPhoto(input: UploadPhotoInput): Promise<UploadPhotoResult> {
  assertPhotoWriteAllowed(input.entityType, input.photoType);
  if (input.useStorageAdapter !== false) {
    if (!isGcsConfigured()) {
      throw new Error(
        'GCS photo storage is not configured (PHOTOS_GCS_BUCKET + Google service-account credentials required)',
      );
    }
    return uploadPhotoToAdapter(input);
  }
  return uploadPhotoLegacyUrl(input);
}

/** Attach a legacy URL (NAS / Vercel Blob) with link + photo_storage row. */
export async function attachPhotoWithLegacyUrl(
  input: AttachLegacyPhotoInput,
): Promise<UploadPhotoResult & { created: boolean }> {
  return withTenantTransaction(input.organizationId, (client) =>
    attachPhotoWithLegacyUrlInTx(client, input),
  );
}

/**
 * {@link attachPhotoWithLegacyUrl} on a caller-owned transaction, so the photo,
 * its link and its storage row commit or roll back with the caller's other
 * writes (e.g. the listing-gallery row that makes it a cover).
 */
export async function attachPhotoWithLegacyUrlInTx(
  client: PoolClient,
  input: AttachLegacyPhotoInput,
): Promise<UploadPhotoResult & { created: boolean }> {
  assertPhotoWriteAllowed(input.entityType, input.photoType);
  const linkRole = input.linkRole ?? 'primary';
  const existingId = await findPhotoByEntityLegacyUrl(client, {
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    legacyUrl: input.legacyUrl,
    linkRole,
  });
  if (existingId) {
    if (!input.idempotent) {
      throw new Error('Photo already exists');
    }
    return { ...photoDisplayUrls(existingId), id: existingId, created: false };
  }

  const poRef =
    input.poRef ?? (await resolvePoRef(input.entityType, input.entityId));
  const photoId = await insertPhotoCatalog(client, {
    organizationId: input.organizationId,
    staffId: input.staffId,
    photoType: input.photoType ?? null,
    poRef,
    clientCapturedAt: input.clientCapturedAt ?? null,
    photoAspect: input.photoAspect ?? null,
  });

  await createPhotoEntityLink(client, {
    photoId,
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    linkRole,
  });

  await client.query(
    `INSERT INTO photo_storage
       (photo_id, organization_id, provider, bucket, object_key, legacy_url, is_primary, content_type)
     VALUES ($1, $2, 'legacy_url', NULL, $3, $4, TRUE, $5)`,
    [
      photoId,
      input.organizationId,
      input.legacyUrl,
      input.legacyUrl,
      input.contentType ?? 'image/jpeg',
    ],
  );

  return { id: photoId, ...photoDisplayUrls(photoId), created: true };
}

async function uploadPhotoLegacyUrl(input: UploadPhotoInput): Promise<UploadPhotoResult> {
  const legacyUrl = (input.legacyUrl || '').trim();
  if (!legacyUrl) throw new Error('legacyUrl required when storage adapter is disabled');

  const result = await attachPhotoWithLegacyUrl({
    organizationId: input.organizationId,
    staffId: input.staffId,
    entityType: input.entityType,
    entityId: input.entityId,
    legacyUrl,
    photoType: input.photoType,
    poRef: input.poRef,
    linkRole: input.linkRole,
    contentType: input.contentType,
    clientCapturedAt: input.clientCapturedAt ?? null,
    photoAspect: input.photoAspect ?? null,
    idempotent: false,
  });
  return result;
}

async function uploadPhotoToAdapter(input: UploadPhotoInput): Promise<UploadPhotoResult> {
  if (input.fileBuffer.length > MAX_BYTES) {
    throw new Error(`Photo exceeds max size (${MAX_BYTES} bytes)`);
  }
  if (!ALLOWED_MIME.has(input.contentType)) {
    throw new Error('Unsupported image type');
  }

  const providerCfg = await getDefaultStorageProvider(input.organizationId);
  const adapter = getStorageAdapter(providerCfg.provider);
  const bucket = resolveGcsBucket(providerCfg.config.bucket as string | undefined);

  // A custom image type (photoType matching a photo_image_types row) routes the
  // object to its own bucket path; built-ins resolve to undefined → entity flow.
  const prefix = await resolveGcsPrefix(input.organizationId, input.photoType);

  return withTenantTransaction(input.organizationId, async (client) => {
    const poRef = input.poRef ?? (await resolvePoRef(input.entityType, input.entityId));

    const photoId = await insertPhotoCatalog(client, {
      organizationId: input.organizationId,
      staffId: input.staffId,
      photoType: input.photoType ?? null,
      poRef,
      // Device-reported, already normalized at the route edge.
      clientCapturedAt: input.clientCapturedAt ?? null,
      // Aspect legality was decided at the route edge against the RESOLVED
      // stage; by here it is a value to persist, not a claim to re-check.
      photoAspect: input.photoAspect ?? null,
    });

    const { objectKey, thumbObjectKey } = buildGcsObjectKey({
      organizationId: input.organizationId,
      entityType: input.entityType,
      photoId,
      entityId: input.entityId,
      poRef,
      // SERIAL_UNIT photos file under `serial-units/{unit_uid}/…`; the uploader
      // passes the unit_uid as poRef, so hand it to the path builder's unitUid
      // slot (ignored for every other entity type).
      unitUid: input.entityType === 'SERIAL_UNIT' ? poRef : null,
      prefix,
    });

    let thumbBuffer: Buffer | null = null;
    try {
      thumbBuffer = await generateThumbnail(input.fileBuffer, THUMB_MAX_PX);
    } catch {
      thumbBuffer = null;
    }

    const putResult = await adapter.putObject({
      organizationId: input.organizationId,
      bucket,
      objectKey,
      thumbObjectKey,
      buffer: input.fileBuffer,
      thumbBuffer,
      contentType: input.contentType,
    });

    await createPhotoEntityLink(client, {
      photoId,
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      linkRole: input.linkRole,
    });

    await client.query(
      `INSERT INTO photo_storage
         (photo_id, organization_id, provider, bucket, object_key, thumb_object_key,
          content_type, file_size_bytes, sha256_hex, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
      [
        photoId,
        input.organizationId,
        providerCfg.provider,
        putResult.bucket,
        putResult.objectKey,
        putResult.thumbObjectKey,
        input.contentType,
        putResult.fileSizeBytes,
        putResult.sha256Hex || sha256Hex(input.fileBuffer),
      ],
    );

    if (isAnalyzeOnUploadEnabled()) {
      await enqueuePhotoJob({
        photoId,
        organizationId: input.organizationId,
        jobType: 'analyze',
      });
    }

    return { id: photoId, ...photoDisplayUrls(photoId) };
  });
}

export async function linkPhoto(input: LinkPhotoInput): Promise<void> {
  await withTenantTransaction(input.organizationId, async (client) => {
    const exists = await client.query(
      `SELECT 1 FROM photos WHERE id = $1 AND organization_id = $2`,
      [input.photoId, input.organizationId],
    );
    if (exists.rowCount === 0) throw new Error('Photo not found');
    await createPhotoEntityLink(client, input);
  });
}

export async function listPhotosForEntity(input: ListForEntityInput) {
  const { where, params, joins } = buildListForEntityQuery(input);
  const res = await tenantQuery<DbPhotoRow>(
    input.organizationId,
    `SELECT ${PHOTO_SELECT}
       FROM photos p
       ${joins}
      WHERE ${where}
      ORDER BY p.id ASC, p.created_at ASC`,
    params,
  );
  return res.rows.map(mapPhotoRow);
}

export async function deletePhoto(photoId: number, organizationId: string): Promise<void> {
  const storageRes = await pool.query<{
    provider: string;
    bucket: string | null;
    object_key: string;
    thumb_object_key: string | null;
    legacy_url: string | null;
  }>(
    `SELECT provider, bucket, object_key, thumb_object_key, legacy_url
       FROM photo_storage WHERE photo_id = $1 AND organization_id = $2`,
    [photoId, organizationId],
  );

  await withTenantTransaction(organizationId, (client) =>
    client.query(`DELETE FROM photos WHERE id = $1 AND organization_id = $2`, [
      photoId,
      organizationId,
    ]),
  );

  for (const row of storageRes.rows) {
    if (row.provider === 'gcs' && row.bucket) {
      try {
        const adapter = getStorageAdapter('gcs');
        await adapter.deleteObject({ bucket: row.bucket, objectKey: row.object_key });
        if (row.thumb_object_key) {
          await adapter.deleteObject({ bucket: row.bucket, objectKey: row.thumb_object_key });
        }
      } catch {
        /* non-fatal */
      }
    }
    const legacyUrl = row.legacy_url || '';
    if (legacyUrl.includes('blob.vercel-storage.com') || legacyUrl.includes('vercel-storage')) {
      try {
        await delBlob(legacyUrl);
      } catch {
        /* non-fatal */
      }
    }
  }
}

export { gcsAdapter, isGcsConfigured, isAdapterUploadEnabled };
