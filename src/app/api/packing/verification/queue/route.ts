import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getPackReviewQueue } from '@/lib/packing/pack-review-queue';
import { isPackReviewBucket } from '@/lib/packing/pack-review-queue-types';

/** GET /api/packing/verification/queue — the latest-outcome review queue for the Review station's packer mode… */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const packerLogId = Number(searchParams.get('packerLogId'));
  if (Number.isFinite(packerLogId) && packerLogId > 0) {
    const { getPackReviewRowByPackerLogId } = await import('@/lib/packing/pack-review-queue');
    const row = await getPackReviewRowByPackerLogId(ctx.organizationId, packerLogId);
    return NextResponse.json({ success: true, row });
  }

  const bucketRaw = searchParams.get('bucket');
  const bucket = isPackReviewBucket(bucketRaw) ? bucketRaw : 'needs_review';
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));

  const rows = await getPackReviewQueue(ctx.organizationId, { bucket, limit });
  return NextResponse.json({ success: true, bucket, rows });
}, { permission: 'packing.review' });
