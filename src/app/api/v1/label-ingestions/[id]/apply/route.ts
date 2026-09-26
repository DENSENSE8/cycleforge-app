import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { labelIngestionApplyBodySchema } from '@/lib/label-ingestions/contracts';
import { applyStoredLabelIngestion } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

export const POST = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  const body = await readV1Json(request, labelIngestionApplyBodySchema, 'An ingestion id and expected row version are required.');
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'An ingestion id and expected row version are required.');
  if (!body.ok) return body.response;
  const result = await applyStoredLabelIngestion({
    organizationId: ctx.organizationId,
    actorStaffId: ctx.staffId,
    ingestionId: id,
    expectedRowVersion: body.data.expectedRowVersion,
  });
  if (!result.ok) return v1Error(409, 'INGESTION_APPLY_CONFLICT', result.message);
  return v1Data(result);
}, { permission: 'packing.complete_order' });
