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

const Linkages = z
  .object({
    order: z.string().trim().min(1).max(128).optional(),
    tracking: z.string().trim().min(1).max(128).optional(),
    serial: z.string().trim().min(1).max(128).optional(),
  })
  .optional();

const Body = z.object({
  subject: z.string().trim().min(1).max(300),
  note: z.string().trim().max(5000).optional(),
  anchor: Anchor.optional(),
  linkages: Linkages,
});

/** POST /api/support/tickets — station-generic ticket create. */
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
      linkages: parsed.data.linkages ?? null,
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
