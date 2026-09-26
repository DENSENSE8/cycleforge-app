import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadPickBoard } from '@/lib/picking/pick-board';
import { pickBoardQuerySchema, pickingV1Error } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** GET /api/v1/picking/board?scope=unassigned|all */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = pickBoardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'scope must be unassigned or all.'), { status: 400 });
  const { scope } = parsed.data;
  const rows = await withTenantTransaction(ctx.organizationId, (client) =>
    loadPickBoard(client, ctx.organizationId, ctx.staffId, scope),
  );
  return NextResponse.json({ data: { scope, rows } }, { headers: { 'cache-control': 'no-store' } });
}, { permission: 'orders.view' });
