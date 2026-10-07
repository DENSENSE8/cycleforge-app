import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { labelIngestionUnpairBodySchema } from '@/lib/label-ingestions/contracts';
import { LabelUnpairError, unpairLabelIngestion } from '@/lib/label-ingestions/unpair';

export const runtime = 'nodejs';

/** POST /api/v1/label-ingestions/{id}/unpair — take a filed label back off its order (waiting pool); `remove` also deletes it. */
export const POST = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  const body = await readV1Json(request, labelIngestionUnpairBodySchema, 'An expected row version is required.');
  if (!body.ok) return body.response;
  try {
    return v1Data(await unpairLabelIngestion(ctx.organizationId, id, {
      expectedRowVersion: body.data.expectedRowVersion,
      remove: body.data.remove,
      actor: { staffId: ctx.staffId, ctx, req: request },
    }));
  } catch (error) {
    if (error instanceof LabelUnpairError) return v1Error(error.code === 'INGESTION_NOT_FOUND' ? 404 : 409, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label could not be unpaired.');
  }
}, { permission: 'packing.complete_order' });
