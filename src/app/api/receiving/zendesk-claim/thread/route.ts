import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  HelpdeskNotConnectedError,
  requireHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { getTicketEntity } from '@/lib/zendesk-links';
import { loadTicketMirror, type TicketMirror } from '@/lib/support/ticket-mirror';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { uploadClaimPhotosToHelpdesk } from '@/lib/receiving-claim-attach';
import {
  archiveAndStampReceivingClaimPhotos,
  claimArchiveResponseFields,
} from '@/lib/receiving-claim-archive';
import {
  buildReceivingClaimTemplate,
  claimAttachmentFileLabel,
  claimBodyToHtml,
  CLAIM_TYPE_LABEL,
  type ClaimType,
} from '@/lib/zendesk-claim-template';

export const dynamic = 'force-dynamic';

/** Read-time view of a receiving claim's Zendesk thread, gated on the receiving permission (the generic /api/zendesk/* routes need… */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

function mapZendeskError(err: unknown, context: string): NextResponse {
  if (err instanceof ZendeskNotConfiguredError || err instanceof HelpdeskNotConnectedError) {
    return notConfigured(context);
  }
  if (err instanceof ZendeskApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
  }
  return errorResponse(err, context);
}

/** Best-effort requester email: the inbound email's from-address, else the mirrored requester. */
function requesterEmailFrom(mirror: TicketMirror): string | null {
  const via = mirror.ticket.via as { source?: { from?: { address?: string } } } | undefined;
  return via?.source?.from?.address?.trim() || mirror.requester?.email?.trim() || null;
}

const Query = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/receiving/zendesk-claim/thread';
  try {
    const { ticketId } = Query.parse({ ticketId: req.nextUrl.searchParams.get('ticketId') ?? undefined });

    const load = await loadTicketMirror(ctx.organizationId, ticketId);
    if (load.status === 'not_configured') return notConfigured(context);
    if (load.status === 'not_found') throw ApiError.notFound('Helpdesk ticket', ticketId);
    const { mirror } = load;

    // Only expose tickets linked to one of this org's receiving entities — the
    // popover is a receiving surface, not a general Zendesk reader. The mirror
    // resolves the entity the way getTicketEntity does.
    if (!mirror.entity || (mirror.entity.type !== 'RECEIVING' && mirror.entity.type !== 'RECEIVING_LINE')) {
      throw ApiError.notFound('Linked receiving ticket', ticketId);
    }

    const { ticket } = mirror;
    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject ?? null,
        status: String(ticket.status ?? ''),
        priority: ticket.priority ? String(ticket.priority) : null,
        url: zendeskTicketUrl(ticket.id),
        requesterEmail: requesterEmailFrom(mirror),
      },
      comments: mirror.comments.map((c) => ({
        id: c.id,
        body: c.body,
        public: c.public,
        createdAt: c.created_at,
        authorId: c.author_id,
      })),
    });
  } catch (err) {
    return mapZendeskError(err, context);
  }
}, { permission: 'receiving.mark_received' });

const CLAIM_TYPE_VALUES = Object.keys(CLAIM_TYPE_LABEL) as [ClaimType, ...ClaimType[]];

const PostBody = z.object({
  ticketId: z.number().int().positive(),
  body: z.string().trim().min(1).max(20000),
  /**
   * false (default) → internal note, not emailed to anyone.
   * true            → public reply, which Zendesk emails to the requester
   *                   (the customer on the case).
   */
  public: z.boolean().optional().default(false),
  /** CC emails — only applied on public replies. */
  emailCcs: z.array(z.string().trim().email()).max(50).optional(),
  /**
   * Operator-edited ticket subject (the link-flow "Ticket" step's Subject
   * field, prefilled from the ticket's current title). Applied to the ticket
   * only when it differs from what's already there.
   */
  subject: z.string().trim().min(1).max(300).optional(),
  /** Receiving carton id — required (with attachPhotoIds) to resolve photos. */
  receivingId: z.number().int().positive().optional(),
  lineId: z.number().int().positive().nullish(),
  claimType: z.enum(CLAIM_TYPE_VALUES).optional(),
  /** Photo row ids to upload as real Zendesk attachments on this comment. */
  attachPhotoIds: z.array(z.number().int().positive()).max(50).optional(),
});

/** POST → add a reply to a receiving claim's Zendesk ticket, optionally attaching selected carton photos and/or updating the ticket subject… */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/receiving/zendesk-claim/thread';
  try {
    const parsed = PostBody.parse(await req.json().catch(() => null));

    const entity = await getTicketEntity(ctx.organizationId, parsed.ticketId);
    if (!entity || (entity.type !== 'RECEIVING' && entity.type !== 'RECEIVING_LINE')) {
      throw ApiError.notFound('Linked receiving ticket', parsed.ticketId);
    }

    const helpdesk = await requireHelpdeskProvider(ctx.organizationId);
    const emailCcs =
      parsed.public && parsed.emailCcs?.length
        ? parsed.emailCcs.map((user_email) => ({ user_email, action: 'put' as const }))
        : undefined;

    const ids = parsed.attachPhotoIds ?? [];
    const receivingId = parsed.receivingId;
    let fileLabel = `TICKET-${parsed.ticketId}`;
    if (receivingId) {
      try {
        const template = await buildReceivingClaimTemplate(
          {
            receivingId,
            lineId: parsed.lineId ?? null,
            claimType: parsed.claimType ?? 'damage',
          },
          ctx.organizationId,
        );
        fileLabel = claimAttachmentFileLabel(template, receivingId);
      } catch (labelErr) {
        console.warn('[POST /api/receiving/zendesk-claim/thread] file label template failed', labelErr);
      }
    }
    const uploads =
      ids.length > 0 && receivingId
        ? await uploadClaimPhotosToHelpdesk({
            helpdesk,
            organizationId: ctx.organizationId,
            receivingId,
            photoIds: ids,
            fileLabel,
          })
        : [];

    // One PUT carries the subject change, the comment (+ uploads), and the CC
    // list — updateTicket accepts all three, so a linked-ticket update never
    // needs a second round trip the way addComment-then-updateTicket would.
    const ticket = await helpdesk.updateTicket(parsed.ticketId, {
      ...(parsed.subject ? { subject: parsed.subject } : {}),
      comment: {
        body: parsed.body,
        html_body: claimBodyToHtml(parsed.body),
        public: parsed.public,
        uploads: uploads.length ? uploads : undefined,
      },
      ...(emailCcs ? { email_ccs: emailCcs } : {}),
    });
    if (!ticket) throw ApiError.notFound('Helpdesk ticket', parsed.ticketId);

    // Link & send archives ALL carton photos into the ticket NAS folder in this
    // same request (Create parity). Seller-step replies omit receivingId and
    // skip the copy. Best-effort — the comment already landed.
    const archived = receivingId
      ? await archiveAndStampReceivingClaimPhotos({
          orgId: ctx.organizationId,
          receivingId,
          ticketId: parsed.ticketId,
          logTag: 'zendesk-claim-thread',
          info: ({ photoIdCount, resolvedCount }) =>
            [
              `Zendesk Ticket: #${parsed.ticketId}`,
              `URL: ${zendeskTicketUrl(parsed.ticketId)}`,
              parsed.subject ? `Subject: ${parsed.subject}` : null,
              parsed.claimType ? `Claim type: ${CLAIM_TYPE_LABEL[parsed.claimType]}` : null,
              'Mode: Link & send (existing ticket)',
              `Updated: ${new Date().toISOString()}`,
              `Photos uploaded to Zendesk: ${uploads.length}`,
              `Photos on claim record: ${photoIdCount}`,
              `Photos resolved for NAS archive: ${resolvedCount}`,
              '',
              '--- Ticket body ---',
              parsed.body,
            ]
              .filter(Boolean)
              .join('\n'),
        })
      : null;

    return NextResponse.json({
      success: true,
      public: parsed.public,
      attachCount: uploads.length,
      ticket: {
        id: ticket.id,
        subject: ticket.subject ?? null,
        status: String(ticket.status ?? ''),
        url: zendeskTicketUrl(ticket.id),
      },
      ...(archived ? claimArchiveResponseFields(archived) : {}),
    });
  } catch (err) {
    return mapZendeskError(err, context);
  }
}, { permission: 'receiving.mark_received' });
