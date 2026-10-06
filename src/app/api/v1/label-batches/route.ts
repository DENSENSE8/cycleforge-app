import { withAuth } from '@/lib/auth/withAuth';
import { v1Data, v1Error } from '@/lib/api/v1-route';
import { uploadLabelBatch } from '@/lib/label-batches/batches';
import { labelBatchUploadFieldsSchema } from '@/lib/label-batches/contracts';
import { LabelBatchError } from '@/lib/label-batches/pdf-pages';

export const runtime = 'nodejs';
/** Every page is stored and matched (a label page's barcode decoded, a paperwork page's text read) before the answer — up to 500 pages. */
export const maxDuration = 300;

const ALLOWED_FIELDS = new Set(['file', 'clientEventId', 'stock']);

/**
 * POST /api/v1/label-batches — upload one PDF: the original is kept, each page
 * lands by its size (4×6-class → label, else packing slip) and is matched to
 * orders silently. 201 new, 200 the same bytes already a file (`duplicate`).
 */
export const POST = withAuth(async (request, ctx) => {
  try {
    const form = await request.formData();
    if ([...form.keys()].some((key) => !ALLOWED_FIELDS.has(key)) || form.getAll('file').length !== 1 || form.getAll('clientEventId').length !== 1 || form.getAll('stock').length > 1) {
      return v1Error(400, 'INVALID_REQUEST', 'Unexpected, missing or repeated multipart field.');
    }
    const fields = labelBatchUploadFieldsSchema.safeParse({ clientEventId: form.get('clientEventId'), stock: form.get('stock') ?? undefined });
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
      stock: fields.data.stock,
    });
    return v1Data(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof LabelBatchError) return v1Error(400, error.code, error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The PDF could not be processed.');
  }
}, { permission: 'packing.complete_order' });
