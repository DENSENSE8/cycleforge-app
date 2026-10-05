import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { deleteUnlinkedLabelIngestion, getLabelIngestion, LabelIngestionServiceError } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  try {
    return v1Data(await getLabelIngestion(ctx.organizationId, id));
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) return v1Error(404, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'Label ingestion could not be read.');
  }
}, { permission: 'packing.review' });

export const DELETE = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  try {
    return v1Data(await deleteUnlinkedLabelIngestion({
      organizationId: ctx.organizationId,
      actorStaffId: ctx.staffId,
      ingestionId: id,
    }));
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) {
      const status = error.code === 'INGESTION_NOT_FOUND' ? 404 : error.code === 'INGESTION_NOT_ACTIONABLE' ? 409 : 500;
      return v1Error(status, error.code, error.message);
    }
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'Label ingestion could not be deleted.');
  }
}, { permission: 'orders.create' });
