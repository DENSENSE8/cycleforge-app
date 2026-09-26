/** Shared NAS archive for receiving claims. */

import { listAllReceivingPhotoIds } from '@/lib/photos/queries/receiving-list';
import {
  archiveClaimToFolder,
  archiveClaimViaAgent,
  resolveClaimArchivePhotoUrl,
} from '@/lib/receiving-claim-photos';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getNasStorageTarget, type OrgSettings } from '@/lib/tenancy/settings';

export type ArchiveClaimCopyResult = {
  folder: string;
  copied: number;
  total: number;
} | null;

interface ArchiveReceivingClaimPhotosArgs {
  orgId: OrgId;
  receivingId: number;
  /** Folder key — Zendesk ticket id (Create / Link) or a sanitized name (manual). */
  ticketId: number | string;
  info:
    | string
    | ((ctx: { photoIdCount: number; resolvedCount: number }) => string);
  /** Console prefix, e.g. `zendesk-claim`. */
  logTag?: string;
}

export interface ArchiveReceivingClaimPhotosResult {
  copied: number;
  total: number;
  folder: string | null;
  photoIdCount: number;
  resolvedCount: number;
  archiveWarning: string | null;
  archiveOk: boolean;
  failReason: string | null;
  claimTargetErr: string | null;
  usedAgent: boolean;
  hasAgentUrl: boolean;
  hasAgentToken: boolean;
}

export interface StampReceivingNasArchiveArgs {
  orgId: string;
  receivingId: number;
  folderName: string;
  copied: number;
}

export interface ArchiveReceivingClaimPhotosDeps {
  listPhotoIds: (orgId: string, receivingId: number) => Promise<number[]>;
  resolvePhotoUrl: (photoId: number, organizationId: string) => Promise<string | null>;
  getOrganization: (orgId: OrgId) => Promise<{ settings: OrgSettings } | null>;
  getNasStorageTarget: (
    settings: OrgSettings,
    key: 'claims',
  ) => { root: string; folder: string };
  archiveViaAgent: (opts: {
    ticketId: number | string;
    photos: Array<{ url: string }>;
    info: string;
    organizationId?: OrgId;
    archiveRoot?: string;
    archiveFolder?: string;
  }) => Promise<ArchiveClaimCopyResult>;
  archiveToFolder: (opts: {
    ticketId: number | string;
    photos: Array<{ url: string }>;
    info: string;
  }) => Promise<ArchiveClaimCopyResult>;
  agentEnv: () => { hasUrl: boolean; hasToken: boolean };
  stamp?: (args: StampReceivingNasArchiveArgs) => Promise<void>;
}

const defaultDeps: ArchiveReceivingClaimPhotosDeps = {
  listPhotoIds: listAllReceivingPhotoIds,
  resolvePhotoUrl: resolveClaimArchivePhotoUrl,
  getOrganization,
  getNasStorageTarget: (settings, key) => getNasStorageTarget(settings, key),
  archiveViaAgent: archiveClaimViaAgent,
  archiveToFolder: archiveClaimToFolder,
  agentEnv: () => ({
    hasUrl: Boolean((process.env.NAS_AGENT_URL || '').trim()),
    hasToken: Boolean((process.env.NAS_AGENT_TOKEN || '').trim()),
  }),
  stamp: stampReceivingNasArchive,
};

const UNAVAILABLE_WARNING =
  'Photos were NOT archived to the NAS (archive agent/mount unavailable).';

function emptyResult(
  photoIdCount: number,
  resolvedCount: number,
  env: { hasUrl: boolean; hasToken: boolean },
  usedAgent: boolean,
  extra: Pick<
    ArchiveReceivingClaimPhotosResult,
    'failReason' | 'claimTargetErr' | 'archiveWarning'
  >,
): ArchiveReceivingClaimPhotosResult {
  return {
    copied: 0,
    total: 0,
    folder: null,
    photoIdCount,
    resolvedCount,
    archiveWarning: extra.archiveWarning,
    archiveOk: false,
    failReason: extra.failReason,
    claimTargetErr: extra.claimTargetErr,
    usedAgent,
    hasAgentUrl: env.hasUrl,
    hasAgentToken: env.hasToken,
  };
}

function partialWarning(
  copied: number,
  total: number,
  photoIdCount: number,
  resolvedCount: number,
): string | null {
  if (resolvedCount < photoIdCount) {
    return `Only ${copied} of ${photoIdCount} photos archived to the NAS. ${photoIdCount - resolvedCount} photo source(s) could not be resolved for archiving.`;
  }
  if (copied < total) {
    return `Only ${copied} of ${total} photos archived to the NAS.`;
  }
  return null;
}

export function claimArchiveResponseFields(r: ArchiveReceivingClaimPhotosResult): {
  archiveWarning: string | null;
  archiveOk: boolean;
  archiveCopied: number;
  archiveTotal: number;
  archiveFolder: string | null;
} {
  return {
    archiveWarning: r.archiveWarning,
    archiveOk: r.archiveOk,
    archiveCopied: r.copied,
    archiveTotal: r.total,
    archiveFolder: r.folder,
  };
}

/**
 * Copy every carton photo into the NAS ticket folder. Never throws.
 */
export async function archiveReceivingClaimPhotos(
  args: ArchiveReceivingClaimPhotosArgs,
  deps: ArchiveReceivingClaimPhotosDeps = defaultDeps,
): Promise<ArchiveReceivingClaimPhotosResult> {
  const env = deps.agentEnv();
  const usedAgent = env.hasUrl && env.hasToken;
  const logTag = args.logTag ?? 'zendesk-claim-archive';

  let photoIds: number[] = [];
  try {
    photoIds = await deps.listPhotoIds(args.orgId, args.receivingId);
  } catch (err) {
    const failReason = err instanceof Error ? err.message : 'photo list failed';
    console.warn(`[${logTag}] photo list failed`, err);
    return emptyResult(0, 0, env, usedAgent, {
      failReason,
      claimTargetErr: null,
      archiveWarning: `NAS archive failed: ${failReason}`,
    });
  }

  const resolved = (
    await Promise.all(
      photoIds.map(async (photoId) => ({
        photoId,
        url: await deps.resolvePhotoUrl(photoId, args.orgId),
      })),
    )
  ).filter((p): p is { photoId: number; url: string } => Boolean(p.url));
  const photos = resolved.map((p) => ({ url: p.url }));
  const photoIdCount = photoIds.length;
  const resolvedCount = photos.length;

  const info =
    typeof args.info === 'function'
      ? args.info({ photoIdCount, resolvedCount })
      : args.info;

  let claimTarget = { root: '', folder: '' };
  let claimTargetErr: string | null = null;
  if (usedAgent) {
    try {
      const org = await deps.getOrganization(args.orgId);
      if (org) claimTarget = deps.getNasStorageTarget(org.settings, 'claims');
    } catch (e) {
      claimTargetErr = e instanceof Error ? e.message : 'org settings lookup failed';
      claimTarget = { root: '', folder: '' };
    }
  }

  let archived: ArchiveClaimCopyResult = null;
  let failReason: string | null = null;
  try {
    archived = usedAgent
      ? await deps.archiveViaAgent({
          ticketId: args.ticketId,
          photos,
          info,
          organizationId: args.orgId,
          archiveRoot: claimTarget.root,
          archiveFolder: claimTarget.folder,
        })
      : await deps.archiveToFolder({
          ticketId: args.ticketId,
          photos,
          info,
        });
    if (!archived) {
      failReason = usedAgent
        ? 'archive agent returned no result (unconfigured base/token at runtime)'
        : `NAS agent not configured at runtime (NAS_AGENT_URL present=${env.hasUrl}, NAS_AGENT_TOKEN present=${env.hasToken}); direct-mount fallback is not writable on this host`;
    }
  } catch (agentErr) {
    failReason = agentErr instanceof Error ? agentErr.message : 'archive failed';
    console.warn(`[${logTag}] photo archive failed`, agentErr);
    return emptyResult(photoIdCount, resolvedCount, env, usedAgent, {
      failReason,
      claimTargetErr,
      archiveWarning: `NAS archive failed: ${failReason}`,
    });
  }

  if (!archived) {
    const details = [failReason, claimTargetErr ? `claims-target: ${claimTargetErr}` : null]
      .filter(Boolean)
      .join(' · ');
    console.warn(`[${logTag}] archive skipped — no agent/mount configured`, {
      usedAgent,
      hasAgentUrl: env.hasUrl,
      hasAgentToken: env.hasToken,
      photoCount: resolvedCount,
      totalPhotoIds: photoIdCount,
      details,
    });
    return emptyResult(photoIdCount, resolvedCount, env, usedAgent, {
      failReason,
      claimTargetErr,
      archiveWarning: UNAVAILABLE_WARNING,
    });
  }

  const archiveWarning = partialWarning(
    archived.copied,
    archived.total,
    photoIdCount,
    resolvedCount,
  );
  console.warn(
    `[${logTag}] archived ${archived.copied}/${archived.total} photo(s) → ${archived.folder}`,
  );
  return {
    copied: archived.copied,
    total: archived.total,
    folder: archived.folder,
    photoIdCount,
    resolvedCount,
    archiveWarning,
    archiveOk: !archiveWarning,
    failReason: null,
    claimTargetErr,
    usedAgent,
    hasAgentUrl: env.hasUrl,
    hasAgentToken: env.hasToken,
  };
}

/** Ticket folder name the NAS agent and the carton stamp both use (no leading `#`). */
export function nasArchiveFolderName(ticketId: number | string): string {
  return String(ticketId).trim().replace(/^#/, '').replace(/[\\/:*?"<>|]+/g, '-').trim();
}

/**
 * Record that this carton was copied to a ticket folder. Failure must not undo
 * a copy that already landed — the worst case is the carton still reads as
 * pending and a second sync is an idempotent re-copy.
 */
export async function stampReceivingNasArchive(
  args: StampReceivingNasArchiveArgs,
): Promise<void> {
  await tenantQuery(
    args.orgId,
    `UPDATE receiving_carton
        SET nas_archived_at = now(),
            nas_archived_ticket = $1,
            nas_archived_photo_count = $2
      WHERE id = $3 AND organization_id = $4`,
    [args.folderName, args.copied, args.receivingId, args.orgId],
  );
}

/**
 * Archive then stamp. Same never-throw contract as
 * {@link archiveReceivingClaimPhotos}: a stamp failure is logged, not thrown.
 */
export async function archiveAndStampReceivingClaimPhotos(
  args: ArchiveReceivingClaimPhotosArgs,
  deps: ArchiveReceivingClaimPhotosDeps = defaultDeps,
): Promise<ArchiveReceivingClaimPhotosResult> {
  const archived = await archiveReceivingClaimPhotos(args, deps);
  if (!archived.folder) return archived;
  const folderName = nasArchiveFolderName(args.ticketId);
  if (!folderName) return archived;
  try {
    await (deps.stamp ?? stampReceivingNasArchive)({
      orgId: args.orgId,
      receivingId: args.receivingId,
      folderName,
      copied: archived.copied,
    });
  } catch (stampErr) {
    console.warn(
      `[${args.logTag ?? 'zendesk-claim-archive'}] archive succeeded but stamp failed`,
      stampErr,
    );
  }
  return archived;
}

/**
 * After an unbox/receiving photo lands on a carton that already has a Zendesk
 * claim, copy the full photo set into that ticket's NAS folder. Used from
 * `after()` so the upload response is not held open for the copy.
 */
export async function autoArchiveClaimPhotosAfterCapture(
  args: { orgId: OrgId; receivingId: number; ticketId: number },
  deps: ArchiveReceivingClaimPhotosDeps = defaultDeps,
): Promise<ArchiveReceivingClaimPhotosResult> {
  return archiveAndStampReceivingClaimPhotos(
    {
      orgId: args.orgId,
      receivingId: args.receivingId,
      ticketId: args.ticketId,
      logTag: 'unbox-photo-auto-archive',
      info: ({ photoIdCount, resolvedCount }) =>
        [
          `Zendesk Ticket: #${args.ticketId}`,
          'Mode: Auto-archive after unbox photo (claim already filed)',
          `Captured: ${new Date().toISOString()}`,
          `Photos on claim record: ${photoIdCount}`,
          `Photos resolved for NAS archive: ${resolvedCount}`,
        ].join('\n'),
    },
    deps,
  );
}
