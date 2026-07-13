import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import {
  archiveClaimToFolder,
  archiveClaimViaAgent,
  resolveClaimArchivePhotoUrl,
} from '@/lib/receiving-claim-photos';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/zendesk-claim-template';
import { listAllReceivingPhotoIds } from '@/lib/photos/queries/receiving-list';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getNasStorageTarget } from '@/lib/tenancy/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Derive the accepted claim types from the SoT (CLAIM_TYPE_LABEL) instead of a
// hardcoded list — a new ClaimType (e.g. 'repair_service') must not silently
// fail validation here just because this route wasn't hand-updated.
const CLAIM_TYPE_VALUES = Object.keys(CLAIM_TYPE_LABEL) as [ClaimType, ...ClaimType[]];

// A positive integer id that may arrive as a string (bigint JSON serialization),
// number, null, "", or "null" — normalize ALL non-positive/absent shapes to
// `undefined` up front so an empty `lineId` can never trip `.positive()`.
// (`z.coerce.number()` turns "" and null into 0, which then fails `.positive()`
// and produced the opaque "Validation failed" on carton-level archives.)
const optionalPositiveId = z.preprocess((v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}, z.number().int().positive().optional());

// The one truly-required id — accepts a string/number but must resolve to a
// positive int; the field path in `details` names it if it doesn't.
const requiredPositiveId = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : v),
  z.number().int().positive(),
);

// Length caps are truncated, never rejected — this text only fills the archive
// info file, so an over-long paste must not fail the whole backup.
const cap = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, max) : v),
    z.string().optional(),
  );

const Body = z.object({
  receivingId: requiredPositiveId,
  lineId: optionalPositiveId,
  // Accept a number or string id → a non-empty folder-name string.
  ticketNumber: z.preprocess(
    (v) => (v == null ? v : String(v).trim()),
    z.string().min(1).max(120),
  ),
  claimType: z.enum(CLAIM_TYPE_VALUES).optional(),
  reason: cap(4000),
  subject: cap(500),
  description: cap(20000),
});

function normalizeArchiveFolderName(input: string): string {
  return input.trim().replace(/^#/, '').replace(/[\\/:*?"<>|]+/g, '-').trim();
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    // safeParse (not .parse) so we can LOG the exact payload that failed and
    // return the field-level issue in `details` — a bare "Validation failed"
    // toast hides which field the client actually sent wrong.
    const raw = await req.json().catch(() => null);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      console.warn('[POST /api/receiving/zendesk-claim/archive-only] validation failed', {
        details,
        received: raw,
      });
      return NextResponse.json({ success: false, error: 'Validation failed', details }, { status: 400 });
    }
    const body = parsed.data;
    const folderName = normalizeArchiveFolderName(body.ticketNumber);
    if (!folderName) {
      return NextResponse.json({ success: false, error: 'Folder name is required' }, { status: 400 });
    }

    const allPhotoIds = await listAllReceivingPhotoIds(ctx.organizationId, body.receivingId);
    const allPhotos = (
      await Promise.all(
        allPhotoIds.map(async (photoId) => ({
          photoId,
          url: await resolveClaimArchivePhotoUrl(photoId, ctx.organizationId),
        })),
      )
    )
      .filter((p): p is { photoId: number; url: string } => Boolean(p.url))
      .map((p) => ({ url: p.url }));

    const info = [
      `Archive target: ${folderName}`,
      'Mode: Archive to NAS (no Zendesk ticket created by this call)',
      body.claimType ? `Claim type: ${CLAIM_TYPE_LABEL[body.claimType as ClaimType]}` : null,
      `Receiving id: ${body.receivingId}`,
      body.lineId != null ? `Receiving line id: ${body.lineId}` : null,
      `Captured: ${new Date().toISOString()}`,
      `Photos on claim record: ${allPhotoIds.length}`,
      `Photos resolved for NAS archive: ${allPhotos.length}`,
      body.subject ? `Subject: ${body.subject}` : null,
      body.reason ? `Reason: ${body.reason}` : null,
      '',
      '--- Draft body ---',
      body.description || '',
    ]
      .filter(Boolean)
      .join('\n');

    // Presence booleans (never the values) so a failure response can say WHICH
    // side is missing without leaking a secret.
    const hasAgentUrl = Boolean((process.env.NAS_AGENT_URL || '').trim());
    const hasAgentToken = Boolean((process.env.NAS_AGENT_TOKEN || '').trim());
    const useAgent = hasAgentUrl && hasAgentToken;

    let claimTarget = { root: '', folder: '' };
    let claimTargetErr: string | null = null;
    if (useAgent) {
      try {
        const org = await getOrganization(ctx.organizationId);
        if (org) claimTarget = getNasStorageTarget(org.settings, 'claims');
      } catch (e) {
        claimTargetErr = e instanceof Error ? e.message : 'org settings lookup failed';
        claimTarget = { root: '', folder: '' };
      }
    }

    // Capture the EXACT reason the archive failed → returned in `details` (and
    // logged) so the operator's toast names it instead of a generic wall.
    // `archiveClaimViaAgent` THROWS on agent/transport failure (vs returning
    // null only when unconfigured), so wrap it and surface either shape.
    let archived: { folder: string; copied: number; total: number } | null = null;
    let failReason: string | null = null;
    try {
      archived = useAgent
        ? await archiveClaimViaAgent({
            ticketId: folderName,
            photos: allPhotos,
            info,
            organizationId: ctx.organizationId,
            archiveRoot: claimTarget.root,
            archiveFolder: claimTarget.folder,
          })
        : await archiveClaimToFolder({
            ticketId: folderName,
            photos: allPhotos,
            info,
          });
      if (!archived) {
        failReason = useAgent
          ? 'archive agent returned no result (unconfigured base/token at runtime)'
          : `NAS agent not configured at runtime (NAS_AGENT_URL present=${hasAgentUrl}, NAS_AGENT_TOKEN present=${hasAgentToken}); direct-mount fallback is not writable on this host`;
      }
    } catch (agentErr) {
      failReason = agentErr instanceof Error ? agentErr.message : 'archive failed';
    }

    if (!archived) {
      const details = [failReason, claimTargetErr ? `claims-target: ${claimTargetErr}` : null]
        .filter(Boolean)
        .join(' · ');
      console.warn('[POST /api/receiving/zendesk-claim/archive-only] archive failed', {
        useAgent,
        hasAgentUrl,
        hasAgentToken,
        photoCount: allPhotos.length,
        totalPhotoIds: allPhotoIds.length,
        details,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Photos were NOT archived to the NAS (archive agent/mount unavailable).',
          details: details || undefined,
        },
        { status: 503 },
      );
    }

    const archiveWarning =
      allPhotos.length < allPhotoIds.length
        ? `Only ${archived.copied} of ${allPhotoIds.length} photos archived to the NAS. ${allPhotoIds.length - allPhotos.length} photo source(s) could not be resolved for archiving.`
        : archived.copied < archived.total
          ? `Only ${archived.copied} of ${archived.total} photos archived to the NAS.`
          : null;

    return NextResponse.json({
      success: true,
      folder: archived.folder,
      folderName,
      copied: archived.copied,
      total: archived.total,
      archiveWarning,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/zendesk-claim/archive-only');
  }
}, { permission: 'receiving.mark_received' });
