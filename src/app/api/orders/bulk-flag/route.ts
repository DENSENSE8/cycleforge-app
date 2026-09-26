import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { setOrderFlagBulk } from '@/lib/orders/order-flags';
import { ORDER_ROW_FLAG_IDS } from '@/lib/orders/order-row-flags';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';

/** Set or clear the triage flag on many orders at once — the multi-select action plane (`ContextualSelectionBar`). */

const BulkFlagBody = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(500),
  flag: z.enum(ORDER_ROW_FLAG_IDS).nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(BulkFlagBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await setOrderFlagBulk({
      orderIds: parsed.orderIds,
      organizationId: gate.ctx.organizationId,
      flag: parsed.flag,
      staffId: gate.ctx.staffId ?? null,
    });

    if (!result.ok) return NextResponse.json({ error: 'Unknown flag' }, { status: 400 });

    // The queue payload is Redis-cached for 300s, and the row's tint / note
    // count are IN that payload — without this the operator's flag silently
    // does not appear for up to five minutes.
    await invalidateAllOrdersApiCaches([], gate.ctx.organizationId);

    // One audit row for one operator gesture, listing what it touched — 50 rows
    // would bury the actual event under its own fan-out.
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-queue-bulk-flag',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: result.updatedIds[0] ?? 0,
      after: { flag: parsed.flag, orderIds: result.updatedIds },
    });

    return NextResponse.json({
      success: true,
      flag: parsed.flag,
      updatedIds: result.updatedIds,
    });
  } catch (error: any) {
    console.error('[POST /api/orders/bulk-flag] error:', error);
    return NextResponse.json(
      { error: 'Failed to set order flags', details: error?.message },
      { status: 500 },
    );
  }
}
