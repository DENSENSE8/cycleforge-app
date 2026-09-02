import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { attachShortageCoverageRows } from '@/lib/orders/attach-shortage-coverage';

/**
 * POST /api/orders/shortage-coverage-import
 *
 * Attach backorder coverage onto existing org orders. Never inserts. Inbound
 * tracking stays on `orders.shortage_coverage` — not outbound tracking.
 */

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(10_000),
  mapping: z.record(z.string(), z.string()),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rows, mapping } = parsed.data;
  if (!mapping.order_number) {
    return NextResponse.json(
      { error: 'mapping.order_number is required (an order number column must be mapped)' },
      { status: 400 },
    );
  }

  const orgId = ctx.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: 'Missing organization' }, { status: 401 });
  }

  try {
    const result = await attachShortageCoverageRows(orgId, { rows, mapping });
    await recordAudit(pool, ctx, request, {
      source: 'shortage-coverage-import',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: `shortage-coverage:${result.updated}`,
      method: 'system',
      extra: {
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to attach coverage';
    console.error('Error in POST /api/orders/shortage-coverage-import:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, { permission: 'orders.import' });
