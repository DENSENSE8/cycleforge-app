import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { labelIngestionIdSchema, safeLabelApiError } from '@/lib/label-ingestions/contracts';
import { LabelIngestionServiceError, retryLabelIngestion } from '@/lib/label-ingestions/ingestion-service';
export const runtime = 'nodejs';
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const id = labelIngestionIdSchema.safeParse(request.nextUrl.pathname.split('/').at(-2));
  if (!id.success) return NextResponse.json(safeLabelApiError('INVALID_REQUEST', 'Invalid ingestion id.'), { status: 400 });
  try { return NextResponse.json({ data: await retryLabelIngestion(ctx.organizationId, id.data) }); }
  catch (error) { if (error instanceof LabelIngestionServiceError) return NextResponse.json(safeLabelApiError(error.code, error.message), { status: error.code === 'INGESTION_NOT_ACTIONABLE' ? 409 : 404 }); return NextResponse.json(safeLabelApiError('INGESTION_PROCESSING_FAILED', 'Label ingestion could not be retried.'), { status: 500 }); }
}, { permission: 'packing.complete_order' });
