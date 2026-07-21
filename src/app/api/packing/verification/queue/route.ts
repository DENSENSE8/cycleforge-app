import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getPackReviewQueue } from '@/lib/packing/pack-review-queue';
import { isPackReviewBucket } from '@/lib/packing/pack-review-queue-types';

/**
 * GET /api/packing/verification/queue — the latest-outcome review queue for the
 * Review station's packer mode (docs/todo/packer-review-station-plan.md §4c).
 * `?bucket=needs_review|exceptions|flagged|approved` (default needs_review),
 * `?limit=` (1..500). Read-only, org-scoped. Gated on `packing.review`.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const bucketRaw = searchParams.get('bucket');
    const bucket = isPackReviewBucket(bucketRaw) ? bucketRaw : 'needs_review';
    const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));

    const rows = await getPackReviewQueue(ctx.organizationId, { bucket, limit });
    return NextResponse.json({ success: true, bucket, rows });
  } catch (error: any) {
    console.error('Error in GET /api/packing/verification/queue:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load review queue' },
      { status: 500 },
    );
  }
}, { permission: 'packing.review' });
