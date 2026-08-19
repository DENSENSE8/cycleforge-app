import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { archiveReceivingClaimPhotos } from '@/lib/receiving-claim-archive';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/zendesk-claim-template';
import { getTicketEntity } from '@/lib/zendesk-links';
import { tenantQuery } from '@/lib/tenancy/db';

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

// Length caps are truncated, never rejected — this text only fills the archive
// info file, so an over-long paste must not fail the whole backup.
const cap = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, max) : v),
    z.string().optional(),
  );

const Body = z.object({
  // Optional when the ticket is already linked to a receiving carton/line —
  // photo-library ticket leaf passes ticketNumber alone.
  receivingId: optionalPositiveId,
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

function parseZendeskTicketId(ticketNumber: string): number | null {
  const digits = ticketNumber.replace(/^#/, '').trim().match(/^\d+$/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Resolve carton (+ optional line) from the ticket's primary entity link. */
async function resolveReceivingFromTicket(
  orgId: string,
  ticketNumber: string,
): Promise<{ receivingId: number; lineId?: number } | null> {
  const zendeskTicketId = parseZendeskTicketId(ticketNumber);
  if (zendeskTicketId == null) return null;
  const entity = await getTicketEntity(orgId, zendeskTicketId);
  if (!entity) return null;
  if (entity.type === 'RECEIVING') {
    return { receivingId: entity.id };
  }
  if (entity.type === 'RECEIVING_LINE') {
    const parent = await tenantQuery<{ receiving_id: number | null }>(
      orgId,
      `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [entity.id, orgId],
    );
    const receivingId = parent.rows[0]?.receiving_id;
    if (receivingId == null || !Number.isFinite(Number(receivingId)) || Number(receivingId) <= 0) {
      return null;
    }
    return { receivingId: Number(receivingId), lineId: entity.id };
  }
  return null;
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

    let receivingId = body.receivingId;
    let lineId = body.lineId;
    if (receivingId == null) {
      const resolved = await resolveReceivingFromTicket(ctx.organizationId, body.ticketNumber);
      if (!resolved) {
        return NextResponse.json(
          {
            success: false,
            error: 'No receiving carton is linked to this ticket',
            details: 'Pass receivingId, or link the ticket to a carton before syncing to NAS.',
          },
          { status: 400 },
        );
      }
      receivingId = resolved.receivingId;
      if (lineId == null && resolved.lineId != null) lineId = resolved.lineId;
    }

    const archived = await archiveReceivingClaimPhotos({
      orgId: ctx.organizationId,
      receivingId,
      ticketId: folderName,
      logTag: 'POST /api/receiving/zendesk-claim/archive-only',
      info: ({ photoIdCount, resolvedCount }) =>
        [
          `Archive target: ${folderName}`,
          'Mode: Archive to NAS (no Zendesk ticket created by this call)',
          body.claimType ? `Claim type: ${CLAIM_TYPE_LABEL[body.claimType as ClaimType]}` : null,
          `Receiving id: ${receivingId}`,
          lineId != null ? `Receiving line id: ${lineId}` : null,
          `Captured: ${new Date().toISOString()}`,
          `Photos on claim record: ${photoIdCount}`,
          `Photos resolved for NAS archive: ${resolvedCount}`,
          body.subject ? `Subject: ${body.subject}` : null,
          body.reason ? `Reason: ${body.reason}` : null,
          '',
          '--- Draft body ---',
          body.description || '',
        ]
          .filter(Boolean)
          .join('\n'),
    });

    if (!archived.folder) {
      const details = [
        archived.failReason,
        archived.claimTargetErr ? `claims-target: ${archived.claimTargetErr}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return NextResponse.json(
        {
          success: false,
          error: 'Photos were NOT archived to the NAS (archive agent/mount unavailable).',
          details: details || undefined,
        },
        { status: 503 },
      );
    }

    // Stamp the carton with WHAT was copied and WHERE (2026-08-18a). Without
    // this the "photos taken since the last sync" state is underivable, which
    // is why the archive prompt could never exist. Written only on a real
    // copy — the 503 above returns before it.
    //
    // Failure to stamp must NOT fail the archive: the photos are already on the
    // NAS, and reporting an error for a copy that succeeded would send the
    // operator to re-run it. Worst case the carton reads as still-pending and
    // a second sync is an idempotent re-copy of the same folder.
    try {
      await tenantQuery(
        ctx.organizationId,
        `UPDATE receiving_carton
            SET nas_archived_at = now(),
                nas_archived_ticket = $1,
                nas_archived_photo_count = $2
          WHERE id = $3 AND organization_id = $4`,
        [folderName, archived.copied, receivingId, ctx.organizationId],
      );
    } catch (stampErr) {
      console.warn(
        '[POST /api/receiving/zendesk-claim/archive-only] archive succeeded but stamp failed',
        stampErr,
      );
    }

    return NextResponse.json({
      success: true,
      folder: archived.folder,
      folderName,
      copied: archived.copied,
      total: archived.total,
      archiveWarning: archived.archiveWarning,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/zendesk-claim/archive-only');
  }
}, { permission: 'receiving.mark_received' });
