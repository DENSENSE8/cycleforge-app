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
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { uploadClaimPhotosToHelpdesk } from '@/lib/receiving-claim-attach';
import {
  archiveReceivingClaimPhotos,
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

/**
 * Read-time view of a receiving claim's Zendesk thread, gated on the receiving
 * permission (the generic /api/zendesk/* routes need integrations.zendesk,
 * which a receiving operator may not hold). Powers the ticket-chip history
 * popover.
 *
 *   GET ?ticketId=N → { ticket, comments } for a ticket linked to one of THIS
 *       org's receiving cartons/lines. Tickets not linked to a receiving entity
 *       are refused so this can't be used to read arbitrary Zendesk tickets.
 */

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

/** Best-effort requester email from via.from, falling back to getUsers. */
async function resolveRequesterEmail(
  ticket: {
    requester_id?: number;
    via?: { source?: { from?: { address?: string } } };
  },
  getUsers: (ids: number[]) => Promise<Array<{ id: number; email: string | null }>>,
): Promise<string | null> {
  const viaEmail = ticket.via?.source?.from?.address?.trim() || null;
  if (viaEmail) return viaEmail;
  const requesterId = ticket.requester_id;
  if (!requesterId) return null;
  const users = await getUsers([requesterId]);
  return users[0]?.email?.trim() || null;
}

const Query = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/receiving/zendesk-claim/thread';
  try {
    const { ticketId } = Query.parse({ ticketId: req.nextUrl.searchParams.get('ticketId') ?? undefined });

    // Only expose tickets linked to one of this org's receiving entities — the
    // popover is a receiving surface, not a general Zendesk reader.
    const entity = await getTicketEntity(ctx.organizationId, ticketId);
    if (!entity || (entity.type !== 'RECEIVING' && entity.type !== 'RECEIVING_LINE')) {
      throw ApiError.notFound('Linked receiving ticket', ticketId);
    }

    const helpdesk = await requireHelpdeskProvider(ctx.organizationId);
    const ticket = await helpdesk.getTicket(ticketId);
    if (!ticket) throw ApiError.notFound('Helpdesk ticket', ticketId);
    const [{ comments }, requesterEmail] = await Promise.all([
      helpdesk.listComments(ticketId, { perPage: 100 }),
      resolveRequesterEmail(ticket, (ids) => helpdesk.getUsers(ids)),
    ]);

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject ?? null,
        status: String(ticket.status ?? ''),
        priority: ticket.priority ? String(ticket.priority) : null,
        url: zendeskTicketUrl(ticket.id),
        requesterEmail,
      },
      comments: comments.map((c) => ({
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

/**
 * POST → add a reply to a receiving claim's Zendesk ticket, optionally
 * attaching selected carton photos and/or updating the ticket subject in the
 * same request (the link-flow's Photos → Ticket → Review steps land here,
 * mirroring the create-flow claim route's upload + file shape). When
 * `receivingId` is present (Link & send), ALL carton photos are archived to
 * the NAS ticket folder after the comment lands — same best-effort copy as
 * Create. Seller-step replies omit `receivingId` and skip the archive.
 * The comment defaults to an internal note (`public: false`); a public reply
 * (`public: true`) emails the customer. Same entity-link guard as the GET so
 * this can only post to tickets linked to one of THIS org's receiving
 * cartons/lines.
 */
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
      ? await archiveReceivingClaimPhotos({
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
