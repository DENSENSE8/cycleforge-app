import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { readLabelFileCheck, LabelFilingError } from '@/lib/label-ingestions/file-on-order';
import { labelFileCheckQuerySchema } from '@/lib/label-ingestions/file-on-order-contracts';

export const runtime = 'nodejs';

/** GET /api/v1/label-ingestions/{id}/file-check?orderId=&tracking= — what filing this label on that order would do (tracking source, other orders holding it, the order's own tracking). */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  const query = readV1Query(request, labelFileCheckQuerySchema, 'An order id is required.');
  if (!query.ok) return query.response;
  try {
    return v1Data(await readLabelFileCheck(ctx.organizationId, id, query.data));
  } catch (error) {
    if (error instanceof LabelFilingError) return v1Error(error.status, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label could not be checked.');
  }
}, { permission: 'packing.review' });
