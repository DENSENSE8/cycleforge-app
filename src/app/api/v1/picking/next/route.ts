import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import { nextDirectedPick } from '@/lib/picking/directed-feed';
import { pickNextBodySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/next — the caller's next directed pick (claims the order it returns). */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, pickNextBodySchema, 'Invalid next-pick body.');
  if (!body.ok) return body.response;
  return v1Data(
    await nextDirectedPick({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      runStartedAt: body.data.runStartedAt ? new Date(body.data.runStartedAt).toISOString() : null,
      deviceId: null,
      skipOrderIds: body.data.skipOrderIds,
    }),
  );
}, { permission: 'orders.view' });
