import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { labelIngestionListQuerySchema, labelIngestionUploadFieldsSchema, safeLabelApiError } from '@/lib/label-ingestions/contracts';
import { createLabelIngestion, LabelIngestionServiceError, listLabelIngestions } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';
function failure(error: unknown): NextResponse {
  if (error instanceof LabelIngestionServiceError) return NextResponse.json(safeLabelApiError(error.code, error.message), { status: error.code === 'INGESTION_NOT_FOUND' ? 404 : error.code === 'CLIENT_EVENT_PAYLOAD_MISMATCH' ? 409 : 400 });
  return NextResponse.json(safeLabelApiError('INGESTION_PROCESSING_FAILED', 'Label ingestion could not be processed.'), { status: 500 });
}
export const GET = withAuth(async (request, ctx) => {
  const parsed = labelIngestionListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json(safeLabelApiError('INVALID_REQUEST', 'Invalid list query.'), { status: 400 });
  return NextResponse.json({ data: await listLabelIngestions(ctx.organizationId, parsed.data.state, parsed.data.limit) });
}, { permission: 'packing.review' });
export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const form = await request.formData();
    const allowedFields = new Set(['file', 'clientEventId', 'observedAt', 'sha256']);
    if ([...form.keys()].some((key) => !allowedFields.has(key)) || ['file', 'clientEventId', 'observedAt'].some((key) => form.getAll(key).length !== 1) || form.getAll('sha256').length > 1) return NextResponse.json(safeLabelApiError('INVALID_REQUEST', 'Unexpected or repeated multipart field.'), { status: 400 });
    const fields = labelIngestionUploadFieldsSchema.safeParse({ clientEventId: form.get('clientEventId'), observedAt: form.get('observedAt'), ...(form.has('sha256') ? { sha256: form.get('sha256') } : {}) });
    const file = form.get('file');
    if (!fields.success || !(file instanceof File) || (file.type !== '' && file.type !== 'application/pdf')) return NextResponse.json(safeLabelApiError('INVALID_REQUEST', 'A PDF, client event id, and observed timestamp are required.'), { status: 400 });
    const result = await createLabelIngestion({ organizationId: ctx.organizationId, actorStaffId: ctx.staffId, clientEventId: fields.data.clientEventId, observedAt: fields.data.observedAt, expectedSha256: fields.data.sha256, fileBasename: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ data: result.ingestion, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) { return failure(error); }
}, { permission: 'packing.complete_order' });
