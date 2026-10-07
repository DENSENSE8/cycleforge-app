import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import {
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import {
  parseTicketLinkAnchorSearch,
  TicketLinkBody,
  TicketReferenceBody,
} from '@/lib/schemas/support-tickets';
import {
  addTicketShipmentReference,
  isHelpdeskNotConnected,
  linkTicketToAnchor,
  findTicketIdentityMatch,
  listCandidatesForAnchor,
  listTicketShipmentReferences,
  listTicketsLinkedToAnchor,
  removeTicketShipmentReference,
  unlinkTicketFromAnchor,
} from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/** Universal ticket ↔ entity link waist. */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/tickets/link';
  try {
    const sp = req.nextUrl.searchParams;

    // ?ticketId=&list=shipments — the STNs this ticket already references.
    // Reads ticket_links directly, so it needs no anchor and no helpdesk call.
    if (sp.get('list') === 'shipments') {
      const ticketId = z.coerce.number().int().positive().parse(sp.get('ticketId'));
      const shipments = await listTicketShipmentReferences({
        orgId: ctx.organizationId,
        ticketId,
      });
      return NextResponse.json({ success: true, shipments });
    }

    // ?list=identity&tracking=&order= — a ticket already on this tracking or order.
    // Local ticket_links only, so the composer card is ready before it opens.
    if (sp.get('list') === 'identity') {
      const match = await findTicketIdentityMatch({
        orgId: ctx.organizationId,
        trackingNumber: sp.get('tracking'),
        orderNumber: sp.get('order'),
      });
      return NextResponse.json({ success: true, match });
    }

    // ?list=linked&anchorType=… — tickets already linked to this anchor (ticket_links; no helpdesk call).
    if (sp.get('list') === 'linked') {
      const tickets = await listTicketsLinkedToAnchor({
        orgId: ctx.organizationId,
        anchor: parseTicketLinkAnchorSearch(sp),
      });
      return NextResponse.json({ success: true, tickets });
    }

    const anchor = parseTicketLinkAnchorSearch(sp);
    const mode = sp.get('mode') === 'reference' ? 'reference' as const : 'anchor' as const;
    const { tickets, hiddenLinked } = await listCandidatesForAnchor({
      orgId: ctx.organizationId,
      anchor,
      query: sp.get('query'),
      mode,
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
    const raw = await req.json().catch(() => null);

    // { ticketId, reference } — attach an EXTRA shipment; the anchor is untouched.
    if (raw && typeof raw === 'object' && 'reference' in raw) {
      const body = TicketReferenceBody.parse(raw);
      const ref = body.reference;
      const result = await addTicketShipmentReference({
        orgId: ctx.organizationId,
        ticketId: body.ticketId,
        shipmentId: 'shipmentId' in ref ? ref.shipmentId : undefined,
        trackingNumber: 'trackingNumber' in ref ? ref.trackingNumber : undefined,
        staffId: ctx.staffId,
      });
      if (result.added) {
        await recordAudit(pool, ctx, req, {
          source: 'support-ticket-link',
          action: AUDIT_ACTION.SUPPORT_TICKET_LINKED,
          entityType: AUDIT_ENTITY.SHIPMENT,
          entityId: result.shipmentId,
          after: {
            zendeskTicketId: body.ticketId,
            isPrimary: result.isPrimary,
            link: 'reference',
          },
        });
      }
      return NextResponse.json({ success: true, ...result });
    }

    const body = TicketLinkBody.parse(raw);
    const result = await linkTicketToAnchor({
      orgId: ctx.organizationId,
      ticketId: body.ticketId,
      anchor: body.anchor,
      staffId: ctx.staffId,
    });
    await recordAudit(pool, ctx, req, {
      source: 'support-ticket-link',
      action: AUDIT_ACTION.SUPPORT_TICKET_LINKED,
      entityType:
        result.entityType === 'SHIPMENT' ? AUDIT_ENTITY.SHIPMENT : result.entityType.toLowerCase(),
      entityId: result.entityId,
      after: { zendeskTicketId: body.ticketId, link: 'anchor' },
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

    // ?reference=1&shipmentId= — drop ONE STN reference. Distinct from the
    // anchor unlink below: no anchor resolution, and removing the anchor row
    // promotes a surviving reference rather than leaving the ticket primary-less.
    if (sp.get('reference') === '1') {
      const shipmentId = z.coerce.number().int().positive().parse(sp.get('shipmentId'));
      const result = await removeTicketShipmentReference({
        orgId: ctx.organizationId,
        ticketId,
        shipmentId,
        staffId: ctx.staffId,
      });
      if (result.removed) {
        await recordAudit(pool, ctx, req, {
          source: 'support-ticket-link',
          action: AUDIT_ACTION.SUPPORT_TICKET_UNLINKED,
          entityType: AUDIT_ENTITY.SHIPMENT,
          entityId: shipmentId,
          before: { zendeskTicketId: ticketId, link: 'reference' },
          after: { promotedShipmentId: result.promotedShipmentId },
        });
      }
      return NextResponse.json({ success: true, ...result });
    }

    const anchor = parseTicketLinkAnchorSearch(sp);
    const { removed, entityType, entityId } = await unlinkTicketFromAnchor({
      orgId: ctx.organizationId,
      ticketId,
      anchor,
      staffId: ctx.staffId,
    });
    if (removed) {
      await recordAudit(pool, ctx, req, {
        source: 'support-ticket-link',
        action: AUDIT_ACTION.SUPPORT_TICKET_UNLINKED,
        entityType: entityType === 'SHIPMENT' ? AUDIT_ENTITY.SHIPMENT : entityType.toLowerCase(),
        entityId,
        before: { zendeskTicketId: ticketId, link: 'anchor' },
      });
    }
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    if (isHelpdeskNotConnected(err)) return notConfigured(context);
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
