import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data, v1Error } from '@/lib/api/v1-route';
import { labelIngestionListQuerySchema, labelIngestionUploadFieldsSchema } from '@/lib/label-ingestions/contracts';
import { createLabelIngestion, LabelIngestionServiceError, listLabelIngestions } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

const ALLOWED_FIELDS = new Set(['file', 'clientEventId', 'observedAt', 'sha256']);

function failure(error: unknown) {
  if (!(error instanceof LabelIngestionServiceError)) {
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'Label ingestion could not be processed.');
  }
  const status = error.code === 'INGESTION_NOT_FOUND' ? 404 : error.code === 'CLIENT_EVENT_PAYLOAD_MISMATCH' ? 409 : 400;
  return v1Error(status, error.code, error.message);
}

export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, labelIngestionListQuerySchema, 'Invalid list query.');
  if (!query.ok) return query.response;
  return v1Data(await listLabelIngestions(ctx.organizationId, query.data.state, query.data.limit));
}, { permission: 'packing.review' });

export const POST = withAuth(async (request, ctx) => {
  try {
    const form = await request.formData();
    const repeated = ['file', 'clientEventId', 'observedAt'].some((key) => form.getAll(key).length !== 1) || form.getAll('sha256').length > 1;
    if ([...form.keys()].some((key) => !ALLOWED_FIELDS.has(key)) || repeated) {
      return v1Error(400, 'INVALID_REQUEST', 'Unexpected or repeated multipart field.');
    }
    const fields = labelIngestionUploadFieldsSchema.safeParse({
      clientEventId: form.get('clientEventId'),
      observedAt: form.get('observedAt'),
      ...(form.has('sha256') ? { sha256: form.get('sha256') } : {}),
    });
    const file = form.get('file');
    if (!fields.success || !(file instanceof File) || (file.type !== '' && file.type !== 'application/pdf')) {
      return v1Error(400, 'INVALID_REQUEST', 'A PDF, client event id, and observed timestamp are required.');
    }
    const result = await createLabelIngestion({
      organizationId: ctx.organizationId,
      actorStaffId: ctx.staffId,
      clientEventId: fields.data.clientEventId,
      observedAt: fields.data.observedAt,
      expectedSha256: fields.data.sha256,
      fileBasename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    // `replayed` rides beside `data`, as it always has; 200 = byte-idempotent replay.
    return Response.json({ data: result.ingestion, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return failure(error);
  }
}, { permission: 'packing.complete_order' });
