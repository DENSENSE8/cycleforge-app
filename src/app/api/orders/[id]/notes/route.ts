import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { createOrderNote, listOrderNotes } from '@/lib/orders/order-notes';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';

/** Internal ops annotations on an order (`order_notes`). */

const NoteBody = z.object({
  noteText: z.string().trim().min(1, 'Note cannot be empty').max(4000),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

    const notes = await listOrderNotes(id, gate.ctx.organizationId);
    return NextResponse.json({ success: true, notes });
  } catch (error: any) {
    console.error('[GET /api/orders/[id]/notes] error:', error);
    return NextResponse.json(
      { error: 'Failed to load order notes', details: error?.message },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

    const parsed = parseBody(NoteBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await createOrderNote({
      orderId: id,
      organizationId: gate.ctx.organizationId,
      noteText: parsed.noteText,
      staffId: gate.ctx.staffId ?? null,
    });

    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Order not found' }, { status: 404 })
        : NextResponse.json({ error: 'Note cannot be empty' }, { status: 400 });
    }

    // The queue payload is Redis-cached for 300s, and the row's tint / note
    // count are IN that payload — without this the operator's flag silently
    // does not appear for up to five minutes.
    await invalidateAllOrdersApiCaches([], gate.ctx.organizationId);
    // Other desks' rows carry the same note count — tell them (the author's
    // own list repaints from its `orders.outbound` refresh signal).
    await publishOrderChanged({ organizationId: gate.ctx.organizationId, orderIds: [id], source: 'orders.note' });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-queue-note',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      after: { note: result.note.noteText },
    });

    return NextResponse.json({ success: true, note: result.note }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/orders/[id]/notes] error:', error);
    return NextResponse.json(
      { error: 'Failed to add order note', details: error?.message },
      { status: 500 },
    );
  }
}
