import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { deleteLabelBatch, getLabelBatch, LabelBatchError } from '@/lib/label-batches/batches';

export const runtime = 'nodejs';

/** GET /api/v1/label-batches/{id} — one upload: its pages in page order and the paired orders' paperwork. */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid batch id.');
  const detail = await getLabelBatch(ctx.organizationId, id);
  if (!detail) return v1Error(404, 'NOT_FOUND', 'Upload was not found.');
  return v1Data(detail);
}, { permission: 'packing.review' });

export const DELETE = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 1);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid batch id.');
  try {
    return v1Data(await deleteLabelBatch(ctx.organizationId, ctx.staffId, id));
  } catch (error) {
    if (error instanceof LabelBatchError) return v1Error(404, error.code, error.message);
    return v1Error(409, 'INGESTION_NOT_ACTIONABLE', error instanceof Error ? error.message : 'Upload could not be deleted.');
  }
}, { permission: 'orders.create' });
