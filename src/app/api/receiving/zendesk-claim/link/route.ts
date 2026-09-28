import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import {
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import {
  isHelpdeskNotConnected,
  linkTicketToAnchor,
  listCandidatesForAnchor,
  unlinkTicketFromAnchor,
} from '@/lib/support/ticket-link';
import { recordTicketReason, resolveTicketReason } from '@/lib/receiving/exceptions';
import {
  ClaimTicketLinkBody,
  ClaimTicketLinkSearchQuery,
  ClaimTicketUnlinkQuery,
  formatZodIssues,
} from './link-request';

export const dynamic = 'force-dynamic';

/** Link an EXISTING Zendesk ticket to a receiving carton/line (the counterpart to POST /api/receiving/zendesk-claim, which creates a fresh… */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

function validationFailed(details: string): NextResponse {
  return NextResponse.json({ success: false, error: 'Validation failed', details }, { status: 400 });
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/receiving/zendesk-claim/link';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = ClaimTicketLinkSearchQuery.safeParse({
      query: sp.get('query') ?? undefined,
      receivingId: sp.get('receivingId') ?? undefined,
      lineId: sp.get('lineId') ?? undefined,
    });
    if (!parsed.success) return validationFailed(formatZodIssues(parsed.error));

    const { tickets, hiddenLinked } = await listCandidatesForAnchor({
      orgId: ctx.organizationId,
      anchor: {
        type: 'receiving',
        receivingId: parsed.data.receivingId,
        lineId: parsed.data.lineId,
      },
      query: parsed.data.query,
    });
    return NextResponse.json({ success: true, tickets, hiddenLinked });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/receiving/zendesk-claim/link';
  try {
    const raw = await req.json().catch(() => null);
    const parsed = ClaimTicketLinkBody.safeParse(raw);
    if (!parsed.success) {
      const details = formatZodIssues(parsed.error);
      console.warn('[POST /api/receiving/zendesk-claim/link] validation failed', {
        details,
        received: raw,
      });
      return validationFailed(details);
    }
    const body = parsed.data;
    const result = await linkTicketToAnchor({
      orgId: ctx.organizationId,
      ticketId: body.ticketId,
      anchor: {
        type: 'receiving',
        receivingId: body.receivingId,
        lineId: body.lineId ?? null,
      },
      staffId: ctx.staffId,
    });
    if (body.claimType) {
      // Same request as the link (owner 2026-09-28): the ticket says why.
      // Best-effort like the create path — the link already committed.
      await recordTicketReason(ctx.organizationId, {
        receivingId: body.receivingId,
        lineId: body.lineId ?? null,
        claimType: body.claimType,
        ticketNumber: result.ticketNumber,
        staffId: ctx.staffId,
      }).catch((err) => console.warn('[POST /api/receiving/zendesk-claim/link] ticket reason write failed', err));
    }
    return NextResponse.json({
      success: true,
      ticketNumber: result.ticketNumber,
      ticketUrl: result.ticketUrl,
      subject: result.subject,
    });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });

/** DELETE ?receivingId=N[&lineId=N]&ticketId=N — detach a linked ticket from the carton/line. */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const context = 'DELETE /api/receiving/zendesk-claim/link';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = ClaimTicketUnlinkQuery.safeParse({
      receivingId: sp.get('receivingId') ?? undefined,
      lineId: sp.get('lineId') ?? undefined,
      ticketId: sp.get('ticketId') ?? undefined,
    });
    if (!parsed.success) return validationFailed(formatZodIssues(parsed.error));

    const { removed, shipmentUnpairWarning } = await unlinkTicketFromAnchor({
      orgId: ctx.organizationId,
      ticketId: parsed.data.ticketId,
      anchor: {
        type: 'receiving',
        receivingId: parsed.data.receivingId,
        lineId: parsed.data.lineId,
      },
    });
    await resolveTicketReason(ctx.organizationId, {
      receivingId: parsed.data.receivingId,
      lineId: parsed.data.lineId ?? null,
      ticketNumber: `#${parsed.data.ticketId}`,
      resolvedBy: ctx.staffId,
    }).catch((err) => console.warn('[DELETE /api/receiving/zendesk-claim/link] ticket reason close failed', err));
    return NextResponse.json({ success: true, removed, shipmentUnpairWarning });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'receiving.mark_received' });
