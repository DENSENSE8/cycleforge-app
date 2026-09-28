import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { nextManualOrderNumber } from '@/lib/orders/create-order';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

/** A channel prefix: 1–6 letters/digits and a dash (`PH-`, `WI-`), optionally under test mode's `CF-TEST-`. */
const PREFIX_RE = /^(CF-TEST-)?[A-Z0-9]{1,6}-$/;

/**
 * GET /api/orders/intake/order-number?prefix=PH-  → `{ next: 'PH-000124' }`
 * GET /api/orders/intake/order-number?check=PH-000124 → `{ taken: { id, orderNumber } | null }`
 *
 * The intake form's order number: the next free number under the channel's
 * prefix (a preview — create answers 409 if it was taken meanwhile), and the
 * inline uniqueness check for a typed one. Uncached: a number created a second
 * ago must read as taken.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const check = (req.nextUrl.searchParams.get('check') ?? '').trim();
  if (check) {
    const { rows } = await tenantQuery<{ id: number; order_id: string }>(
      orgId,
      'SELECT id, order_id FROM orders WHERE organization_id = $1 AND order_id = $2 ORDER BY id LIMIT 1',
      [orgId, check.slice(0, 120)],
    );
    const row = rows[0];
    return NextResponse.json({ ok: true, taken: row ? { id: Number(row.id), orderNumber: row.order_id } : null });
  }
  const prefix = (req.nextUrl.searchParams.get('prefix') ?? '').trim().toUpperCase();
  if (!PREFIX_RE.test(prefix)) {
    return NextResponse.json({ ok: false, error: 'prefix must be 1–6 letters or digits and a dash' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, next: await nextManualOrderNumber(orgId, prefix) });
}, { permission: 'orders.create' });
