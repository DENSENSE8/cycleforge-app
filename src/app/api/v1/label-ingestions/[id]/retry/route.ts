import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { LabelIngestionServiceError, retryLabelIngestion } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

export const POST = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  try {
    return v1Data(await retryLabelIngestion(ctx.organizationId, id));
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) {
      return v1Error(error.code === 'INGESTION_NOT_ACTIONABLE' ? 409 : 404, error.code, error.message);
    }
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'Label ingestion could not be retried.');
  }
}, { permission: 'packing.complete_order' });
