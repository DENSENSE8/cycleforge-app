import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { LabelUnpairError, readLabelUnpairCheck } from '@/lib/label-ingestions/unpair';

export const runtime = 'nodejs';

/** GET /api/v1/label-ingestions/{id}/unpair-check — what an unpair takes off the order (tracking, and the scan-out it warns about). */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  try {
    return v1Data(await readLabelUnpairCheck(ctx.organizationId, id));
  } catch (error) {
    if (error instanceof LabelUnpairError) return v1Error(error.code === 'INGESTION_NOT_FOUND' ? 404 : 409, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label could not be checked.');
  }
}, { permission: 'packing.review' });
