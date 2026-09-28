import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import { paperworkPrintRecordBodySchema } from '@/lib/label-prints/contracts';
import { recordPaperworkPrints } from '@/lib/label-prints/print-queue';

export const runtime = 'nodejs';

/** POST /api/v1/paperwork-prints — log one paperwork print batch (packing slips, manuals) per order, with its station. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, paperworkPrintRecordBodySchema, 'A batch id, channel and unique paperwork items are required.');
  if (!body.ok) return body.response;
  return v1Data(await recordPaperworkPrints(ctx.organizationId, ctx.staffId, body.data));
}, { permission: 'print.label' });
