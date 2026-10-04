import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { labelIngestionConfirmOrderBodySchema } from '@/lib/label-ingestions/contracts';
import { confirmLabelIngestionOrder, LabelIngestionServiceError } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

/** POST /api/v1/label-ingestions/{id}/confirm-order — pair a quarantined label to the order the operator picked; re-pairs the buyer's other waiting labels. */
export const POST = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  const body = await readV1Json(request, labelIngestionConfirmOrderBodySchema, 'An order id and expected row version are required.');
  if (!body.ok) return body.response;
  try {
    return v1Data(await confirmLabelIngestionOrder({ organizationId: ctx.organizationId, actorStaffId: ctx.staffId, ingestionId: id, ...body.data }));
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) return v1Error(error.code === 'INGESTION_NOT_FOUND' ? 404 : 409, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label could not be paired.');
  }
}, { permission: 'packing.complete_order' });
