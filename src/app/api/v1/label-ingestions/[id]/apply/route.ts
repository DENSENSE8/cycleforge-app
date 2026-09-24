import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { labelIngestionApplyBodySchema, labelIngestionIdSchema, safeLabelApiError } from '@/lib/label-ingestions/contracts';
import { applyStoredLabelIngestion } from '@/lib/label-ingestions/ingestion-service';
export const runtime = 'nodejs';
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const id = labelIngestionIdSchema.safeParse(request.nextUrl.pathname.split('/').at(-2)); const body = labelIngestionApplyBodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json(safeLabelApiError('INVALID_REQUEST', 'An ingestion id and expected row version are required.'), { status: 400 });
  const result = await applyStoredLabelIngestion({ organizationId: ctx.organizationId, actorStaffId: ctx.staffId, ingestionId: id.data, expectedRowVersion: body.data.expectedRowVersion });
  if (!result.ok) return NextResponse.json(safeLabelApiError('INGESTION_APPLY_CONFLICT', result.message), { status: 409 });
  return NextResponse.json({ data: result });
}, { permission: 'packing.complete_order' });
