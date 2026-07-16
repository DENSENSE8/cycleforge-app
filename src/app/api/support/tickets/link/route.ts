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
  addTicketShipmentReference,
  isHelpdeskNotConnected,
  linkTicketToAnchor,
  listCandidatesForAnchor,
  listTicketShipmentReferences,
  removeTicketShipmentReference,
  unlinkTicketFromAnchor,
  type TicketLinkAnchorInput,
} from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/**
 * Universal ticket ↔ entity link waist.
 *
 *   GET  ?anchorType=&…&query=   → link candidates for the resolved entity
 *   GET  ?anchorType=&…&mode=reference
 *                                → candidates for attaching an EXTRA shipment
 *   GET  ?ticketId=&list=shipments → the STNs a ticket already references
 *   POST { ticketId, anchor }    → set the ticket's ANCHOR (one per ticket)
 *   POST { ticketId, reference } → add an extra STN reference (many per ticket)
 *   DELETE ?ticketId=&anchorType=&…       → entity-scoped unlink of the anchor
 *   DELETE ?ticketId=&shipmentId=&reference=1 → drop one STN reference
 *
 * Anchor types: receiving (receivingId + optional lineId), tracking, shipment, order.
 *
 * ANCHOR vs REFERENCE: a ticket has at most ONE anchor (what it is about,
 * enforced by ux_ticket_links_ticket_primary) and any number of references (other
 * shipments it touches). The anchor POST keeps its already-linked-elsewhere 409;
 * the reference POST deliberately does not, because attaching a second STN to an
 * anchored ticket is the whole point.
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

/** Add an EXTRA shipment to a ticket that keeps its existing anchor. */
const ReferenceBody = z.object({
  ticketId: z.number().int().positive(),
  reference: z.union([
    z.object({ shipmentId: z.number().int().positive() }),
    z.object({ trackingNumber: z.string().trim().min(1) }),
  ]),
});

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

    const anchor = parseAnchorFromSearch(sp);
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
      const body = ReferenceBody.parse(raw);
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

    const body = LinkBody.parse(raw);
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

    const anchor = parseAnchorFromSearch(sp);
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
