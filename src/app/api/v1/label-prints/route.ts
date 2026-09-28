import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, readV1Query, v1Data } from '@/lib/api/v1-route';
import { labelPrintQueueQuerySchema, labelPrintRecordBodySchema } from '@/lib/label-prints/contracts';
import { listPrintDeskQueue, recordLabelPrints } from '@/lib/label-prints/print-queue';

export const runtime = 'nodejs';

/** GET /api/v1/label-prints?view=labels|paperwork|printed — the print desk queue, with true counts for all three views. */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, labelPrintQueueQuerySchema, 'Invalid print queue query.');
  if (!query.ok) return query.response;
  return v1Data(await listPrintDeskQueue(ctx.organizationId, query.data.view, query.data.limit));
}, { permission: 'packing.review' });

/** POST /api/v1/label-prints — log one label print batch (Print all, Print, Reprint) and the station it went to. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, labelPrintRecordBodySchema, 'A batch id, channel and unique label ids are required.');
  if (!body.ok) return body.response;
  return v1Data(await recordLabelPrints(ctx.organizationId, ctx.staffId, body.data));
}, { permission: 'print.label' });
