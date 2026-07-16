import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
  type TicketLinkAnchorInput,
} from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/**
 * Universal ticket ↔ entity link waist.
 *
 *   GET  ?anchorType=&…&query= → link candidates for the resolved entity
 *   POST { ticketId, anchor }  → write ticket_links (+ display column / external_id)
 *   DELETE ?ticketId=&anchorType=&… → entity-scoped unlink
 *
 * Anchor types: receiving (receivingId + optional lineId), tracking, shipment, order.
 */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

const AnchorType = z.enum(['receiving', 'tracking', 'shipment', 'order']);

function parseAnchorFromSearch(sp: URLSearchParams): TicketLinkAnchorInput {
  const anchorType = AnchorType.parse(sp.get('anchorType') ?? undefined);
  if (anchorType === 'receiving') {
    const receivingId = z.coerce.number().int().positive().parse(sp.get('receivingId'));
    const lineRaw = sp.get('lineId');
    const lineId = lineRaw != null && lineRaw !== ''
      ? z.coerce.number().int().parse(lineRaw)
      : undefined;
    return { type: 'receiving', receivingId, lineId };
  }
  if (anchorType === 'tracking') {
    const trackingNumber = z.string().trim().min(1).parse(sp.get('tracking') ?? sp.get('trackingNumber'));
    return { type: 'tracking', trackingNumber };
  }
  if (anchorType === 'shipment') {
    const shipmentId = z.coerce.number().int().positive().parse(sp.get('shipmentId'));
    return { type: 'shipment', shipmentId };
  }
  const orderId = z.coerce.number().int().positive().parse(sp.get('orderId'));
  return { type: 'order', orderId };
}

const LinkBody = z.object({
  ticketId: z.number().int().positive(),
  anchor: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('receiving'),
      receivingId: z.number().int().positive(),
      lineId: z.number().int().nullable().optional(),
    }),
    z.object({
      type: z.literal('tracking'),
      trackingNumber: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal('shipment'),
      shipmentId: z.number().int().positive(),
    }),
    z.object({
      type: z.literal('order'),
      orderId: z.number().int().positive(),
    }),
  ]),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/tickets/link';
  try {
    const sp = req.nextUrl.searchParams;
    const anchor = parseAnchorFromSearch(sp);
    const { tickets, hiddenLinked } = await listCandidatesForAnchor({
      orgId: ctx.organizationId,
      anchor,
      query: sp.get('query'),
    });
    return NextResponse.json({ success: true, tickets, hiddenLinked });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/support/tickets/link';
  try {
    const body = LinkBody.parse(await req.json().catch(() => null));
    const result = await linkTicketToAnchor({
      orgId: ctx.organizationId,
      ticketId: body.ticketId,
      anchor: body.anchor,
      staffId: ctx.staffId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });

const UnlinkQuery = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const context = 'DELETE /api/support/tickets/link';
  try {
    const sp = req.nextUrl.searchParams;
    const { ticketId } = UnlinkQuery.parse({ ticketId: sp.get('ticketId') ?? undefined });
    const anchor = parseAnchorFromSearch(sp);
    const { removed } = await unlinkTicketFromAnchor({
      orgId: ctx.organizationId,
      ticketId,
      anchor,
    });
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
