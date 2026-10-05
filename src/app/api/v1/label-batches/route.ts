import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data, v1Error } from '@/lib/api/v1-route';
import { LabelBatchError, listLabelBatches, uploadLabelBatch } from '@/lib/label-batches/batches';
import { labelBatchListQuerySchema, labelBatchUploadFieldsSchema } from '@/lib/label-batches/contracts';

export const runtime = 'nodejs';
/** Every page is parsed (an image-only label also has its barcode decoded) before the answer — up to 500 pages. */
export const maxDuration = 300;

const ALLOWED_FIELDS = new Set(['file', 'clientEventId', 'matchOrder']);

/** GET /api/v1/label-batches?q=&from=&to=&limit= — uploaded label PDFs, newest upload first. */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, labelBatchListQuerySchema, 'Invalid uploads query.');
  if (!query.ok) return query.response;
  return v1Data(await listLabelBatches(ctx.organizationId, query.data));
}, { permission: 'packing.review' });

/** POST /api/v1/label-batches — upload one label PDF; every page lands as a label. 201 new, 200 same bytes already a batch. */
export const POST = withAuth(async (request, ctx) => {
  try {
    const form = await request.formData();
    if ([...form.keys()].some((key) => !ALLOWED_FIELDS.has(key)) || form.getAll('file').length !== 1 || form.getAll('clientEventId').length !== 1 || form.getAll('matchOrder').length > 1) {
      return v1Error(400, 'INVALID_REQUEST', 'Unexpected, missing or repeated multipart field.');
    }
    const fields = labelBatchUploadFieldsSchema.safeParse({ clientEventId: form.get('clientEventId') });
    const file = form.get('file');
    if (!fields.success || !(file instanceof File) || (file.type !== '' && file.type !== 'application/pdf')) {
      return v1Error(400, 'INVALID_REQUEST', 'A PDF and a client event id are required.');
    }
    const result = await uploadLabelBatch({
      organizationId: ctx.organizationId,
      actorStaffId: ctx.staffId,
      clientEventId: fields.data.clientEventId,
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      matchOrder: form.get('matchOrder') !== 'false',
    });
    return v1Data(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof LabelBatchError) return v1Error(400, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label PDF could not be processed.');
  }
}, { permission: 'packing.complete_order' });
