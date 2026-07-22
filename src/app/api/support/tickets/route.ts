import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { readIdempotencyKey } from '@/lib/api-idempotency';
import { createSupportTicket } from '@/lib/support/create-ticket';
import { isHelpdeskNotConnected } from '@/lib/support/ticket-link';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

const Anchor = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order'), orderId: z.coerce.number().int().positive() }),
  z.object({ type: z.literal('shipment'), shipmentId: z.coerce.number().int().positive() }),
  z.object({ type: z.literal('tracking'), trackingNumber: z.string().trim().min(1) }),
  z.object({
    type: z.literal('receiving'),
    receivingId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().nullable().optional(),
  }),
]);

const Body = z.object({
  subject: z.string().trim().min(1).max(300),
  note: z.string().trim().max(5000).optional(),
  anchor: Anchor.optional(),
});

/**
 * POST /api/support/tickets — station-generic ticket create.
 *
 * Mints a live helpdesk ticket via the capability facade and (optionally) links
 * it to an anchor through the shared link waist ({@link createSupportTicket} →
 * `linkTicketToAnchor`). Returns the provider id so the caller can open it
 * (`?ticket=<providerTicketId>`). Idempotent: an `Idempotency-Key` header dedupes
 * a retried submit (the facade caches an identical-key create).
 *
 * Gated on `integrations.zendesk` (the station-generic create capability); a
 * disconnected helpdesk returns an operator-actionable 409, not a 500.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }

    const result = await createSupportTicket({
      orgId: ctx.organizationId,
      subject: parsed.data.subject,
      note: parsed.data.note ?? null,
      anchor: parsed.data.anchor ?? null,
      staffId: ctx.staffId ?? null,
      idempotencyKey: readIdempotencyKey(req),
    });

    await recordAudit(pool, ctx, req, {
      source: 'support-api',
      action: AUDIT_ACTION.SUPPORT_TICKET_CREATE,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET,
      entityId: result.supportTicketId,
      after: {
        providerTicketId: result.providerTicketId,
        linkedEntityType: result.linkedEntityType,
        linkedEntityId: result.linkedEntityId,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // A disconnected helpdesk is operator-actionable, not a server error.
    if (isHelpdeskNotConnected(err)) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Helpdesk not connected' },
        { status: 409 },
      );
    }
    return errorResponse(err, 'POST /api/support/tickets');
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
