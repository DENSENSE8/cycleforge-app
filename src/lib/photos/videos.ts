import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { resolvePoRef } from './resolve-po-ref';
import { resolveGcsBucket } from './storage/gcs-adapter';
import { buildGcsVideoObjectKey } from './storage/path-builder';
import { getDefaultStorageProvider } from './storage/resolve-primary';
import type { PhotoEntityType } from './types';
import type { VideoMime } from './video-upload-rules';

/**
 * `entity_videos` — the video twin of the photo catalog, keyed by the same
 * polymorphic (entity_type, entity_id) pair as `photo_entity_links`. Every
 * statement runs in `withTenantTransaction` and names `organization_id`
 * explicitly from the auth context. Why videos are not `photos` rows: see
 * `src/lib/migrations/2026-09-24d_entity_videos.sql`.
 */

export interface EntityVideoRow {
  id: number;
  entityType: PhotoEntityType;
  entityId: number;
  status: 'pending' | 'ready';
  bucket: string;
  objectKey: string;
  contentType: VideoMime;
  declaredSizeBytes: number;
  fileSizeBytes: number | null;
  createdAt: string;
  uploadedAt: string | null;
}

const VIDEO_SELECT = `
  SELECT id::text AS id, entity_type, entity_id::text AS entity_id, status, bucket, object_key,
         content_type, declared_size_bytes::text AS declared_size_bytes,
         file_size_bytes::text AS file_size_bytes, created_at, uploaded_at
    FROM entity_videos`;

interface VideoDbRow {
  id: string;
  entity_type: PhotoEntityType;
  entity_id: string;
  status: 'pending' | 'ready';
  bucket: string;
  object_key: string;
  content_type: VideoMime;
  declared_size_bytes: string;
  file_size_bytes: string | null;
  created_at: Date;
  uploaded_at: Date | null;
}

function mapVideoRow(row: VideoDbRow): EntityVideoRow {
  return {
    id: Number(row.id),
    entityType: row.entity_type,
    entityId: Number(row.entity_id),
    status: row.status,
    bucket: row.bucket,
    objectKey: row.object_key,
    contentType: row.content_type,
    declaredSizeBytes: Number(row.declared_size_bytes),
    fileSizeBytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    createdAt: row.created_at.toISOString(),
    uploadedAt: row.uploaded_at ? row.uploaded_at.toISOString() : null,
  };
}

async function selectVideo(client: PoolClient, organizationId: string, videoId: number) {
  const r = await client.query<VideoDbRow>(`${VIDEO_SELECT} WHERE organization_id = $1 AND id = $2`, [
    organizationId,
    videoId,
  ]);
  return r.rows[0] ? mapVideoRow(r.rows[0]) : null;
}

/**
 * Insert a `pending` video and fix its object key. The id is drawn first so
 * the key can carry it (`{org}/videos/{entity flow}/{id}.{ext}`), resolved
 * through the same bucket + po_ref routing a photo upload uses.
 */
export async function createPendingVideo(input: {
  organizationId: string;
  staffId: number;
  entityType: PhotoEntityType;
  entityId: number;
  contentType: VideoMime;
  extension: string;
  declaredSizeBytes: number;
}): Promise<EntityVideoRow> {
  const providerCfg = await getDefaultStorageProvider(input.organizationId);
  const bucket = resolveGcsBucket(providerCfg.config.bucket as string | undefined);
  return withTenantTransaction(input.organizationId, async (client) => {
    const idRes = await client.query<{ id: string }>(
      `SELECT nextval(pg_get_serial_sequence('entity_videos', 'id'))::text AS id`,
    );
    const videoId = Number(idRes.rows[0].id);
    const poRef = await resolvePoRef(input.entityType, input.entityId, client);
    const objectKey = buildGcsVideoObjectKey({
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      videoId,
      extension: input.extension,
      poRef,
      // Photos of a serial unit file under its unit uid, which resolvePoRef returns.
      unitUid: input.entityType === 'SERIAL_UNIT' ? poRef : null,
    });
    await client.query(
      `INSERT INTO entity_videos
         (id, organization_id, entity_type, entity_id, staff_id, status, bucket, object_key,
          content_type, declared_size_bytes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)`,
      [
        videoId,
        input.organizationId,
        input.entityType,
        input.entityId,
        input.staffId,
        bucket,
        objectKey,
        input.contentType,
        input.declaredSizeBytes,
      ],
    );
    const row = await selectVideo(client, input.organizationId, videoId);
    if (!row) throw new Error(`entity_videos ${videoId} vanished after insert`);
    return row;
  });
}

/** One video in the caller's org, any status; null when absent. */
export async function getVideo(organizationId: string, videoId: number): Promise<EntityVideoRow | null> {
  return withTenantTransaction(organizationId, (client) => selectVideo(client, organizationId, videoId));
}

/**
 * Flip a pending video to `ready` with the size GCS stored. Idempotent: an
 * already-ready row is returned unchanged (a double-tapped finalize).
 */
export async function markVideoReady(
  organizationId: string,
  videoId: number,
  fileSizeBytes: number,
): Promise<EntityVideoRow | null> {
  return withTenantTransaction(organizationId, async (client) => {
    await client.query(
      `UPDATE entity_videos
          SET status = 'ready', file_size_bytes = $3, uploaded_at = NOW()
        WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
      [organizationId, videoId, fileSizeBytes],
    );
    return selectVideo(client, organizationId, videoId);
  });
}

/** Ready videos on one entity, oldest upload first. */
export async function listReadyVideosForEntity(input: {
  organizationId: string;
  entityType: PhotoEntityType;
  entityId: number;
}): Promise<EntityVideoRow[]> {
  return withTenantTransaction(input.organizationId, async (client) => {
    const r = await client.query<VideoDbRow>(
      `${VIDEO_SELECT}
        WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'ready'
        ORDER BY uploaded_at ASC, id ASC`,
      [input.organizationId, input.entityType, input.entityId],
    );
    return r.rows.map(mapVideoRow);
  });
}
