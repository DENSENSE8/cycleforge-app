import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchPickList, parsePickListScope } from '@/lib/picking/pick-list';

/**
 * GET /api/picking/list?scope=mine|all|unpaired
 *
 * Line-grained, location-ordered pick list over live unit allocations.
 * The acting picker comes from the verified session, never from the query
 * string — `scope=mine` must mean "mine" and nothing else.
 */
export const GET = withAuth(async (request, ctx) => {
  const scope = parsePickListScope(new URL(request.url).searchParams.get('scope'));
  const staffId = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

  try {
    const result = await fetchPickList({ orgId: ctx.organizationId, staffId, scope });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/picking/list] error:', err);
    const message = err instanceof Error ? err.message : 'pick list query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, { permission: 'orders.view' });
