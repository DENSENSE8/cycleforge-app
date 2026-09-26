import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { autoAllocateForOrders } from '@/lib/allocation/auto-allocate';

/** POST /api/allocation/auto */
export const POST = withAuth(async (request, ctx) => {
  const body: unknown = await request.json().catch(() => null);
  const rawIds = (body as { orderIds?: unknown } | null)?.orderIds;

  let orderIds: number[] | null = null;
  if (rawIds !== undefined && rawIds !== null) {
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ ok: false, error: 'orderIds must be an array of order ids' }, { status: 400 });
    }
    orderIds = rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    // An array that was sent but contained nothing usable is a caller bug, not
    // a request to sweep the whole org — refuse rather than silently widening
    // the scope to every order in the tenant.
    if (orderIds.length !== rawIds.length) {
      return NextResponse.json({ ok: false, error: 'orderIds must contain positive integers' }, { status: 400 });
    }
  }

  try {
    const result = await autoAllocateForOrders(orderIds, {
      orgId: ctx.organizationId,
      staffId: typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'allocation failed';
    console.error('[POST /api/allocation/auto] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'orders.allocate' });
