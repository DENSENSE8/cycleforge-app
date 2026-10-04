/**
 * /api/support/tickets/[ticketId]/items — what we sent the customer on a ticket
 * (support_ticket_items; task-principles P7). `[ticketId]` is the provider
 * (Zendesk) ticket number every ticket surface already holds.
 *
 * Gated by `integrations.zendesk` — the same permission that posts the reply
 * the picks ride on, so anyone who can send the comment can log its items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportTicketItemsCreateBody } from '@/lib/schemas/support-ticket-items';
import { listTicketItems, recordTicketItems, TicketItemsError } from '@/lib/support/ticket-items';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

type Params = Promise<{ ticketId: string }>;

/** GET — every item logged on the ticket, newest first, with live product faces. */
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const gate = await requireRoutePerm(req, 'integrations.zendesk');
  if (gate.denied) return gate.denied;
  try {
    const ticketId = Number((await params).ticketId);
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id' }, { status: 400 });
    }
    const items = await listTicketItems(gate.ctx.organizationId, ticketId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error in GET /api/support/tickets/[ticketId]/items:', error);
    return NextResponse.json({ success: false, error: 'Failed to load ticket items' }, { status: 500 });
  }
}

/**
 * POST { zendeskCommentId?, items: [{ skuCatalogId, role, qty, note?, clientEventId }] }
 * — log the picks that rode one sent comment. Idempotent per clientEventId:
 * a replay returns the same rows with `created: 0` (200, not 201).
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const gate = await requireRoutePerm(req, 'integrations.zendesk');
  if (gate.denied) return gate.denied;
  try {
    const ticketId = Number((await params).ticketId);
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ticket id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(SupportTicketItemsCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await recordTicketItems({
      orgId: gate.ctx.organizationId,
      staffId: gate.ctx.staffId ?? null,
      zendeskTicketId: ticketId,
      zendeskCommentId: parsed.zendeskCommentId ?? null,
      items: parsed.items,
    });

    if (result.created > 0) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'support-ticket-items-api',
        action: AUDIT_ACTION.SUPPORT_TICKET_ITEM_ADD,
        entityType: AUDIT_ENTITY.SUPPORT_TICKET_ITEM,
        entityId: result.items.map((it) => it.id).join(','),
        method: 'manual',
        after: {
          ticketId,
          zendeskCommentId: parsed.zendeskCommentId ?? null,
          items: result.items.map((it) => ({
            id: it.id,
            skuCatalogId: it.product.skuCatalogId,
            sku: it.product.sku,
            role: it.role,
            qty: it.qty,
          })),
        },
      });
    }

    return NextResponse.json(
      { items: result.items, created: result.created },
      { status: result.created > 0 ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof TicketItemsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error in POST /api/support/tickets/[ticketId]/items:', error);
    return NextResponse.json({ success: false, error: 'Failed to log ticket items' }, { status: 500 });
  }
}
