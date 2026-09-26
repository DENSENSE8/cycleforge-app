import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import { releaseOrderSessions } from '@/lib/picking/sessions';
import { pickOrderBodySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/release — hand an order back (skip / pass) without staging its tote. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, pickOrderBodySchema, 'orderId is required.');
  if (!body.ok) return body.response;
  const released = await releaseOrderSessions({ orderId: body.data.orderId, pickerStaffId: ctx.staffId }, ctx.organizationId);
  return v1Data({ released });
}, { permission: 'orders.view' });
