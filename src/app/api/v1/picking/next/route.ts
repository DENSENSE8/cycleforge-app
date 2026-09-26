import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { nextDirectedPick } from '@/lib/picking/directed-feed';
import { pickNextBodySchema, pickingV1Error } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/next — the caller's next directed pick (claims the order it returns). */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = pickNextBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'Invalid next-pick body.'), { status: 400 });
  const data = await nextDirectedPick({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    runStartedAt: parsed.data.runStartedAt ? new Date(parsed.data.runStartedAt).toISOString() : null,
    deviceId: null,
    skipOrderIds: parsed.data.skipOrderIds,
  });
  return NextResponse.json({ data }, { headers: { 'cache-control': 'no-store' } });
}, { permission: 'orders.view' });
