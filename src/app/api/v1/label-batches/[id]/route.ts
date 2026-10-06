import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { deleteLabelBatch, getLabelBatch } from '@/lib/label-batches/batches';
import { LabelIngestionServiceError } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

/** GET /api/v1/label-batches/{id} — one file and its label pages as ledger rows, page order (an order slot files them). */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid batch id.');
  const detail = await getLabelBatch(ctx.organizationId, id);
  if (!detail) return v1Error(404, 'NOT_FOUND', 'Upload was not found.');
  return v1Data(detail);
}, { permission: 'packing.review' });

/** DELETE /api/v1/label-batches/{id} — the file, its label and paperwork pages and its original; 409 while any page is on an order. */
export const DELETE = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid batch id.');
  try {
    const deleted = await deleteLabelBatch(ctx.organizationId, ctx.staffId, id);
    if (!deleted) return v1Error(404, 'NOT_FOUND', 'Upload was not found.');
    return v1Data(deleted);
  } catch (error) {
    if (error instanceof LabelIngestionServiceError && error.code === 'INGESTION_NOT_ACTIONABLE') return v1Error(409, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The upload could not be deleted.');
  }
}, { permission: 'orders.create' });
