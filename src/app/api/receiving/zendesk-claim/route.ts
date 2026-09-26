import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import {
  buildReceivingClaimTemplate,
  CLAIM_TYPE_LABEL,
  type ClaimType,
} from '@/lib/zendesk-claim-template';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { poReceivingLink } from '@/lib/receiving-claim-photos';
import { readIdempotencyKey, withIdempotentResponse } from '@/lib/api-idempotency';
import { fileReceivingClaim } from '@/lib/receiving/file-receiving-claim';
import { buildClaimSharePack, claimOpeningBody } from '@/lib/receiving/claim-share-pack';
import { createSharePack } from '@/lib/photos/share-packs';
import { listAllReceivingPhotoIds } from '@/lib/photos/queries/receiving-list';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ClaimRequest {
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
  /** Operator-edited subject. When omitted, the server builds from template. */
  subject?: string;
  /** Operator-edited body. When omitted, the server builds from template. */
  description?: string;
  /** Seller-facing marketplace message (plain text, no URLs). Persisted to Neon. */
  sellerMessage?: string;
  /** Photo row ids (from /api/receiving-photos) to upload to Zendesk as files. */
  attachPhotoIds?: number[];
  /**
   * CC collaborator emails. Zendesk only emails CCs on a PUBLIC comment, so
   * these are applied only when `notePublic` is true (matches the UI, which
   * hides the CC field on an internal note).
   */
  ccEmails?: string[];
  /**
   * File the opening comment as a PUBLIC reply (emails the requester + CCs)
   * instead of the default internal note (`public: false`).
   */
  notePublic?: boolean;
  /** Operator "Test create": */
  dryRun?: boolean;
}

/** Create a Zendesk ticket for a receiving claim (damage / missing / wrong item / vendor defect) directly via the Zendesk REST API… */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = (await req.json().catch(() => null)) as ClaimRequest | null;
    if (!body) throw ApiError.badRequest('Missing body');

    const receivingId = Number(body.receivingId);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      throw ApiError.badRequest('Valid receivingId is required');
    }

    const claimType = body.claimType;
    if (!claimType || !(claimType in CLAIM_TYPE_LABEL)) {
      throw ApiError.badRequest('Invalid claimType');
    }
    const lineIdRaw = body.lineId != null ? Number(body.lineId) : null;
    const lineId = lineIdRaw != null && Number.isFinite(lineIdRaw) ? lineIdRaw : null;

    const editedSubject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const editedDescription = typeof body.description === 'string' ? body.description.trim() : '';
    const notePublic = body.notePublic === true;

    const template = await buildReceivingClaimTemplate({
      receivingId,
      lineId,
      claimType,
      reason: body.reason,
      poReceivingLink: poReceivingLink(req, receivingId),
    }, ctx.organizationId);
    const subject = editedSubject || template.subject;
    const description = editedDescription || template.description;

    if (body.dryRun === true) {
      const attachPhotoIds = Array.isArray(body.attachPhotoIds)
        ? body.attachPhotoIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      const ccEmails = notePublic && Array.isArray(body.ccEmails)
        ? body.ccEmails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim())).length
        : 0;

      // The share pack IS built — it is the thing under test, and a dry run that skipped it would prove nothing about the link the vendor gets.
      const sharePack = await buildClaimSharePack({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
        receivingId,
        photoIds: attachPhotoIds,
        origin: req.nextUrl.origin,
        createPack: createSharePack,
        listPhotos: listAllReceivingPhotoIds,
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        ticketNumber: '#TEST',
        subject,
        // Exactly the body the real filer would open the ticket with — pack
        // link folded in, one message.
        description: claimOpeningBody(description, sharePack?.shareUrl ?? null),
        sharePackUrl: sharePack?.shareUrl ?? null,
        sharePackPhotoCount: sharePack?.photoIds.length ?? 0,
        attachCount: attachPhotoIds.length,
        notePublic,
        ccCount: ccEmails,
      });
    }

    const helpdesk = await getHelpdeskProvider(ctx.organizationId);
    if (!helpdesk) {
      return NextResponse.json(
        {
          success: false,
          error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}`,
          draftBody: description,
        },
        { status: 503 },
      );
    }

    const idempotencyKey = readIdempotencyKey(req);
    const result = await withIdempotentResponse(
      pool,
      { orgId: ctx.organizationId, idempotencyKey, route: 'POST /api/receiving/zendesk-claim', staffId: ctx.staffId },
      async (): Promise<{ status: number; body: Record<string, unknown> }> => {
        const filed = await fileReceivingClaim(
          {
            orgId: ctx.organizationId,
            staffId: ctx.staffId,
            receivingId,
            lineId,
            claimType,
            reason: body.reason,
            subject: editedSubject || undefined,
            description: editedDescription || undefined,
            sellerMessage: body.sellerMessage,
            attachPhotoIds: body.attachPhotoIds,
            ccEmails: body.ccEmails,
            notePublic,
            poReceivingLink: poReceivingLink(req, receivingId),
            idempotencyKey,
            sharePackOrigin: req.nextUrl.origin,
          },
          { getHelpdesk: async () => helpdesk },
        );

        if (!filed.success) {
          return {
            status: filed.status,
            body: {
              success: false,
              error: filed.error,
              draftBody: filed.draftBody,
            },
          };
        }

        return {
          status: 200,
          body: {
            success: true,
            ticketNumber: filed.ticketNumber,
            ticketUrl: filed.ticketUrl,
            reusedExisting: filed.reusedExisting,
            archiveOk: filed.archiveOk,
            archiveCopied: filed.archiveCopied,
            archiveTotal: filed.archiveTotal,
            archiveFolder: filed.archiveFolder,
            ...(filed.archiveWarning ? { archiveWarning: filed.archiveWarning } : {}),
            ...(filed.sharePackUrl ? { sharePackUrl: filed.sharePackUrl } : {}),
          },
        };
      },
    );

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/zendesk-claim');
  }
}, { permission: 'receiving.mark_received' });
