import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { listLabelPrintHistory } from '@/lib/label-prints/print-queue';

export const runtime = 'nodejs';

/** GET /api/v1/label-ingestions/{id}/prints — one label's print log, newest first. */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  const events = await listLabelPrintHistory(ctx.organizationId, id);
  if (!events) return v1Error(404, 'INGESTION_NOT_FOUND', 'Label ingestion was not found.');
  return v1Data(events);
}, { permission: 'packing.review' });
