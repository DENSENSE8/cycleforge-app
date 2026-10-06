import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import { labelPrintRecordBodySchema } from '@/lib/label-prints/contracts';
import { recordLabelPrints } from '@/lib/label-prints/print-queue';

export const runtime = 'nodejs';

/** POST /api/v1/label-prints — log one label print batch (Print all, Print, Reprint) and the station it went to. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, labelPrintRecordBodySchema, 'A batch id, channel and unique label ids are required.');
  if (!body.ok) return body.response;
  return v1Data(await recordLabelPrints(ctx.organizationId, ctx.staffId, body.data));
}, { permission: 'print.label' });
