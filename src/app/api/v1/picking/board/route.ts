import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data } from '@/lib/api/v1-route';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadPickBoard } from '@/lib/picking/pick-board';
import { pickBoardQuerySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** GET /api/v1/picking/board?scope=unassigned|all */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, pickBoardQuerySchema, 'scope must be unassigned or all.');
  if (!query.ok) return query.response;
  const { scope } = query.data;
  const rows = await withTenantTransaction(ctx.organizationId, (client) =>
    loadPickBoard(client, ctx.organizationId, ctx.staffId, scope),
  );
  return v1Data({ scope, rows });
}, { permission: 'orders.view' });
