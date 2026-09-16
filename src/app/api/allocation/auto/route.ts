import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { autoAllocateForOrders } from '@/lib/allocation/auto-allocate';

/**
 * POST /api/allocation/auto
 *
 * Reserve stocked serialized units for order lines that have none.
 *
 * Body: `{ orderIds?: number[] }`. Omitted (or empty) = sweep every
 * unallocated, unshipped order in the session org — the door an operator uses
 * when the pick list looks short, and the same call the ingest path makes per
 * batch.
 *
 * Response: `{ inserted, shortfalls }`. The shortfalls are the point as much
 * as the insert count: they name every line that could NOT be filled and why
 * (no SKU pairing, no stock, ungraded stock, below the sold tier, or a partial
 * fill), so "nothing to pick" is always explainable.
 *
 * No `audit` floor here on purpose: every inserted row stamps
 * `allocated_by_staff_id` + `allocated_at`, which is a finer trail than one
 * summary row per call could be.
 */
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
