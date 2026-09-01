import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { createOrderNotesBulk } from '@/lib/orders/order-notes';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';

/**
 * Append one ops note onto many orders — the multi-select Notes CTA.
 *
 * Does NOT go through `/api/orders/assign`. Notes are an append-only trail
 * (`order_notes`); the assign waist must not grow a second writer.
 *
 * Ids the org does not own are dropped, not fatal — the response reports what
 * actually changed.
 */

const BulkNotesBody = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(500),
  noteText: z.string().trim().min(1, 'Note cannot be empty').max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(BulkNotesBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await createOrderNotesBulk({
      orderIds: parsed.orderIds,
      organizationId: gate.ctx.organizationId,
      noteText: parsed.noteText,
      staffId: gate.ctx.staffId ?? null,
    });

    await invalidateAllOrdersApiCaches([], gate.ctx.organizationId);

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-queue-bulk-notes',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: result.updatedIds[0] ?? 0,
      after: { note: parsed.noteText, orderIds: result.updatedIds },
    });

    return NextResponse.json({
      success: true,
      updatedIds: result.updatedIds,
    });
  } catch (error: unknown) {
    console.error('[POST /api/orders/notes/bulk] error:', error);
    return NextResponse.json(
      {
        error: 'Failed to save notes',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
