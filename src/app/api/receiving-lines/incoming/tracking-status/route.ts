/** POST /api/receiving-lines/incoming/tracking-status */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { TrackingRemovalStatusBody } from '@/lib/schemas/tracking-removal-status';
import { resolveTrackingRemovalStatus } from '@/lib/receiving/tracking-removal-status';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(TrackingRemovalStatusBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await resolveTrackingRemovalStatus(ctx.organizationId, parsed.trackings);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'tracking-status failed';
    console.error('incoming/tracking-status POST failed:', error);
    // A failed resolve must NOT degrade to an empty report: "none of these
    // exist" is a stronger claim than the lookup can make, and it is exactly
    // the false certainty this initiative removed from the ERP check.
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'receiving.view' });
