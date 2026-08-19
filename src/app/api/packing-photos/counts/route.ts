import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { countPackerPhotosByTracking } from '@/lib/photos/queries/packer-list';
import { normalizeTrackingKey } from '@/lib/tracking-format';

export const dynamic = 'force-dynamic';

/** Cap per request — the header preview shows a handful of rows, not a feed. */
const MAX_TRACKING = 25;

/**
 * Batch pack-photo counts for search rows.
 *
 *   GET ?tracking=a,b,c → { counts: { <normalizedTracking>: number } }
 *
 * Read-only sibling of `/api/packing-photos`, same `packing.view` gate. Search
 * rows hold a tracking number and nothing else, and they must paint a truthful
 * count (including 0) rather than guessing from the presence of a shipment —
 * hence a batch read instead of one request per row.
 *
 * Absent keys mean zero; the client does not distinguish "no packer log" from
 * "log with no photos", because the CTA says the same thing either way.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = new URL(req.url).searchParams.get('tracking') ?? '';
    const trackingKeys = raw
      .split(',')
      .map((v) => normalizeTrackingKey(v))
      .filter((v) => v.length > 0)
      .slice(0, MAX_TRACKING);

    if (trackingKeys.length === 0) return NextResponse.json({ counts: {} });

    const counts = await countPackerPhotosByTracking({
      organizationId: ctx.organizationId,
      trackingKeys,
    });
    return NextResponse.json({ counts });
  } catch (error) {
    return errorResponse(error, 'GET /api/packing-photos/counts');
  }
}, { permission: 'packing.view' });
