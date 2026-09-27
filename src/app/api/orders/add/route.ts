import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { createOrder } from '@/lib/orders/create-order';
import { parseOrderCreateBody } from '@/lib/schemas/order-create';

/**
 * POST /api/orders/add — add one order (one line, or a multi-line phone order
 * under one number). The whole create lives in `createOrder`, which the
 * assistant's phone-order path shares; this is its HTTP door.
 */
const IDEMPOTENCY_ROUTE = 'orders.add';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const idempotencyKey = readIdempotencyKey(
    req,
    body.idempotencyKey ?? body.clientEventId ?? body.client_event_id ?? null,
  );

  const out = await withIdempotencyClaim<Record<string, unknown>>(pool, {
    orgId: ctx.organizationId,
    idempotencyKey,
    route: IDEMPOTENCY_ROUTE,
    staffId: ctx.staffId ?? null,
  }, async () => {
    const parsed = parseOrderCreateBody(body as Record<string, unknown>);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    return createOrder(
      {
        organizationId: ctx.organizationId,
        staffId: ctx.staffId ?? null,
        auth: ctx,
        req,
        idempotencyKey,
        source: 'orders.add',
      },
      parsed.input,
    );
  });

  return NextResponse.json(out.body, { status: out.status });
}, { permission: 'orders.create' });
