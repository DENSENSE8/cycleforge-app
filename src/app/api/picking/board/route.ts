import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadPickBoard } from '@/lib/picking/pick-board';
import type { PickBoardScope } from '@/lib/picking/directed-pick';

/**
 * GET /api/picking/board?scope=unassigned|all
 *
 * The phone's pick board: `unassigned` (default) lists orders with open picks
 * that nobody owns and nobody is holding; `all` lists every order with open
 * picks, owner, backups and holder named. Ownership is the directed feed's own
 * (`loadPickCandidates`), so the board and "next pick" agree.
 */
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
