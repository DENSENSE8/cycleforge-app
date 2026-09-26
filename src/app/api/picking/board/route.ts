import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadPickBoard } from '@/lib/picking/pick-board';
import type { PickBoardScope } from '@/lib/picking/directed-pick';

/** GET /api/picking/board?scope=unassigned|all */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const scope: PickBoardScope = request.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'unassigned';
  try {
    const rows = await withTenantTransaction(ctx.organizationId, (client) =>
      loadPickBoard(client, ctx.organizationId, ctx.staffId, scope),
    );
    return NextResponse.json({ ok: true, scope, rows });
  } catch (err) {
    console.error('[GET /api/picking/board]', err);
    return NextResponse.json({ ok: false, error: 'Could not load the pick board' }, { status: 500 });
  }
}, { permission: 'orders.view' });
