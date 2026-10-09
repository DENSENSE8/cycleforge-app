/**
 * Packer photo NAS backup — the Media library "Back up packer photos" button.
 *
 * Copies pack-station photos (photo_entity_links PACKER_LOG) to the office NAS
 * through the office NAS agent's file PUT (the route the Unbox NAS mirror
 * uses), one named file at a time:
 *
 *   /Volumes/USAV Media/Packing/Shipping Packing Photos/<YYYY-MM-DD packed>/
 *     <order id>_<tracking>_<packer>/<order id>_<tracking>_<packer>_<photo id>.jpg
 *
 * Missing parts drop out of the name (no order → tracking + packer; neither →
 * `packer-log-<id>`). A copied photo gets a 'completed' photo_jobs row
 * (job_type 'packer_nas_backup'), so each run resumes where the last stopped.
 */

import { nasAgentToken, nasAgentUrl } from '@/lib/nas-agent-client';
import { readPhotoBytesById } from '@/lib/photos/read-bytes';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

export const PACKER_PHOTO_NAS_ROOT = '/Volumes/USAV Media/Packing/Shipping Packing Photos';

const JOB_TYPE = 'packer_nas_backup';
const DEFAULT_BATCH = 150;
const MAX_BATCH = 300;

export interface PackerBackupPhotoRow {
  photoId: number;
  packerLogId: number;
  /** Pacific civil day of the pack (`packer_logs.created_at`). */
  packedOn: string;
  orderId: string | null;
  tracking: string | null;
  packerName: string | null;
}

export interface PackerBackupFolder {
  /** Date folder under the root, `YYYY-MM-DD`. */
  dateFolder: string;
  /** `<order id>_<tracking>_<packer>` — also every file's name stem. */
  name: string;
  orderId: string | null;
  tracking: string | null;
  packerName: string | null;
  photoIds: number[];
}

export interface PackerBackupBatchResult {
  folders: number;
  copied: number;
  failed: number;
  remaining: number;
  /** First agent / read error of the run, if any. */
  error: string | null;
}

export interface PackerBackupDeps {
  selectPending: (orgId: OrgId, limit: number) => Promise<PackerBackupPhotoRow[]>;
  countPending: (orgId: OrgId) => Promise<number>;
  readBytes: (photoId: number, orgId: OrgId) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Write one file at `relPath` under {@link PACKER_PHOTO_NAS_ROOT}. */
  putFile: (relPath: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  markCopied: (orgId: OrgId, photoIds: number[]) => Promise<void>;
}

/** Strip characters the NAS (SMB/APFS) refuses in a file or folder name. */
function safeSegment(value: string): string {
  return value.trim().replace(/^#/, '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim();
}

/** `<order id>_<tracking>_<packer>` with missing parts dropped; `packer-log-<id>` when all are missing. */
export function packerBackupFolderName(
  row: Pick<PackerBackupPhotoRow, 'orderId' | 'tracking' | 'packerName' | 'packerLogId'>,
): string {
  const parts = [row.orderId, row.tracking, row.packerName]
    .map((part) => safeSegment(part ?? ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('_') : `packer-log-${row.packerLogId}`;
}

/** Group photos into date › pack folders, preserving first-seen order. */
export function groupPackerBackupFolders(rows: readonly PackerBackupPhotoRow[]): PackerBackupFolder[] {
  const byKey = new Map<string, PackerBackupFolder>();
  for (const row of rows) {
    const name = packerBackupFolderName(row);
    const key = `${row.packedOn}/${name}`;
    let folder = byKey.get(key);
    if (!folder) {
      folder = {
        dateFolder: row.packedOn,
        name,
        orderId: row.orderId,
        tracking: row.tracking,
        packerName: row.packerName,
        photoIds: [],
      };
      byKey.set(key, folder);
    }
    if (!folder.photoIds.includes(row.photoId)) folder.photoIds.push(row.photoId);
  }
  return [...byKey.values()];
}

function folderInfo(folder: PackerBackupFolder): string {
  return [
    `Order: ${folder.orderId ?? '(no order matched)'}`,
    `Tracking: ${folder.tracking ?? '(none)'}`,
    `Packed on: ${folder.dateFolder}`,
    `Packed by: ${folder.packerName ?? '(unknown)'}`,
    `Backed up: ${new Date().toISOString()}`,
  ].join('\n') + '\n';
}

// Shared FROM/WHERE: every PACKER_LOG photo with no completed backup row.
const PENDING_FROM_SQL = `
       FROM photo_entity_links pel
       JOIN photos p
         ON p.id = pel.photo_id AND p.organization_id = pel.organization_id
       JOIN packer_logs pl
         ON pl.id = pel.entity_id AND pl.organization_id = pel.organization_id
      WHERE pel.organization_id = $1
        AND pel.entity_type = 'PACKER_LOG'
        AND NOT EXISTS (
          SELECT 1 FROM photo_jobs j
           WHERE j.organization_id = pel.organization_id
             AND j.photo_id = pel.photo_id
             AND j.job_type = '${JOB_TYPE}'
             AND j.status = 'completed'
        )`;

async function selectPendingPackerPhotos(
  orgId: OrgId,
  limit: number,
): Promise<PackerBackupPhotoRow[]> {
  const res = await tenantQuery<{
    photo_id: string;
    packer_log_id: number;
    packed_on: string;
    order_id: string | null;
    tracking: string | null;
    packer_name: string | null;
  }>(
    orgId,
    `SELECT pending.photo_id, pending.packer_log_id, pending.packed_on,
            COALESCE(NULLIF(BTRIM(o.order_id), ''), pending.po_ref) AS order_id,
            COALESCE(NULLIF(BTRIM(stn.tracking_number_raw), ''), pending.scan_ref) AS tracking,
            s.name AS packer_name
       FROM (
         SELECT DISTINCT ON (p.id)
                p.id AS photo_id,
                pl.id AS packer_log_id,
                pl.created_at AS packed_at,
                to_char(pl.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS packed_on,
                NULLIF(BTRIM(p.po_ref), '') AS po_ref,
                NULLIF(BTRIM(pl.scan_ref), '') AS scan_ref,
                pl.shipment_id,
                pl.packed_by,
                pl.organization_id
           ${PENDING_FROM_SQL}
          ORDER BY p.id, pl.created_at
       ) pending
       LEFT JOIN shipping_tracking_numbers stn
         ON stn.id = pending.shipment_id AND stn.organization_id = pending.organization_id
       LEFT JOIN LATERAL (
         SELECT o1.order_id FROM orders o1
          WHERE o1.organization_id = pending.organization_id
            AND pending.shipment_id IS NOT NULL
            AND o1.shipment_id = pending.shipment_id
          ORDER BY o1.id
          LIMIT 1
       ) o ON TRUE
       LEFT JOIN staff s
         ON s.id = pending.packed_by AND s.organization_id = pending.organization_id
      ORDER BY pending.packed_at ASC, pending.photo_id ASC
      LIMIT $2`,
    [orgId, limit],
  );
  return res.rows.map((r) => ({
    photoId: Number(r.photo_id),
    packerLogId: Number(r.packer_log_id),
    packedOn: r.packed_on,
    orderId: r.order_id,
    tracking: r.tracking,
    packerName: r.packer_name,
  }));
}

async function countPendingPackerPhotos(orgId: OrgId): Promise<number> {
  const res = await tenantQuery<{ count: string }>(
    orgId,
    `SELECT COUNT(DISTINCT pel.photo_id)::text AS count ${PENDING_FROM_SQL}`,
    [orgId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

async function markPackerPhotosCopied(orgId: OrgId, photoIds: number[]): Promise<void> {
  if (photoIds.length === 0) return;
  await tenantQuery(
    orgId,
    `INSERT INTO photo_jobs (photo_id, organization_id, job_type, status, attempts, scheduled_at, completed_at)
     SELECT ids.photo_id, $1, '${JOB_TYPE}', 'completed', 1, NOW(), NOW()
       FROM unnest($2::bigint[]) AS ids(photo_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM photo_jobs j
         WHERE j.organization_id = $1
           AND j.photo_id = ids.photo_id
           AND j.job_type = '${JOB_TYPE}'
           AND j.status = 'completed'
      )`,
    [orgId, photoIds],
  );
}

/**
 * PUT one file through the office NAS agent (`/file/shipping/...` with the
 * packer root in `x-nas-root`). No `x-nas-org-id`: the agent pins org-scoped
 * requests to that org's synced shipping root, which would ignore this root.
 */
async function putPackerFile(relPath: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const base = nasAgentUrl();
  const token = nasAgentToken();
  if (!base || !token) throw new Error('NAS agent is not configured (NAS_AGENT_URL / NAS_AGENT_TOKEN)');
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${base}/file/shipping/${encoded}`, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-agent-token': token, 'x-nas-root': PACKER_PHOTO_NAS_ROOT },
    // Blob satisfies BodyInit for any ArrayBufferLike-backed view (Buffer from the storage read).
    body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NAS agent PUT failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
}

const defaultDeps: PackerBackupDeps = {
  selectPending: selectPendingPackerPhotos,
  countPending: countPendingPackerPhotos,
  readBytes: async (photoId, orgId) => {
    const read = await readPhotoBytesById(photoId, orgId);
    return read ? { bytes: read.bytes, contentType: read.contentType } : null;
  },
  putFile: putPackerFile,
  markCopied: markPackerPhotosCopied,
};

/**
 * Copy one batch of not-yet-backed-up packer photos to the NAS. Each photo is
 * its own PUT (`<folder>/<folder>_<photo id>.jpg`) and is marked copied as soon
 * as it lands; a failed photo retries next run (same name, so a re-copy overwrites).
 */
export async function runPackerNasBackupBatch(
  input: { organizationId: OrgId; limit?: number },
  deps: PackerBackupDeps = defaultDeps,
): Promise<PackerBackupBatchResult> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_BATCH, 1), MAX_BATCH);
  const orgId = input.organizationId;
  const folders = groupPackerBackupFolders(await deps.selectPending(orgId, limit));

  let copied = 0;
  let failed = 0;
  let error: string | null = null;

  folderLoop: for (const folder of folders) {
    const dir = `${folder.dateFolder}/${folder.name}`;
    const done: number[] = [];
    for (const photoId of folder.photoIds) {
      try {
        const read = await deps.readBytes(photoId, orgId);
        if (!read) throw new Error(`photo ${photoId} has no readable source`);
        await deps.putFile(`${dir}/${folder.name}_${photoId}.jpg`, read.bytes, read.contentType || 'image/jpeg');
        done.push(photoId);
      } catch (err) {
        failed += 1;
        error ??= err instanceof Error ? err.message : 'NAS copy failed';
        // Agent unreachable / unconfigured: every later photo fails the same way.
        if (copied === 0 && done.length === 0 && /NAS agent/.test(error)) break folderLoop;
      }
    }
    if (done.length === 0) continue;
    await deps.putFile(`${dir}/_pack-info.txt`, new TextEncoder().encode(folderInfo(folder)), 'text/plain').catch(() => undefined);
    await deps.markCopied(orgId, done);
    copied += done.length;
  }

  return {
    folders: folders.length,
    copied,
    failed,
    remaining: await deps.countPending(orgId),
    error,
  };
}
