import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data } from '@/lib/api/v1-route';
import { listOutboundWork } from '@/lib/outbound/work-projection';
import { outboundWorkQuerySchema } from '@/lib/outbound/work-contract';

export const runtime = 'nodejs';

/**
 * Native and Swift clients receive this server-owned projection only. The
 * active organization comes from the verified session, never the request.
 */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, outboundWorkQuerySchema, 'Invalid outbound work query.');
  if (!query.ok) return query.response;
  return v1Data(await listOutboundWork(ctx.organizationId, query.data));
}, { permission: 'orders.view' });
