/** POST /api/receiving-lines/incoming/tracking-status */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { TrackingRemovalStatusBody } from '@/lib/schemas/tracking-removal-status';
import { resolveTrackingRemovalStatus } from '@/lib/receiving/tracking-removal-status';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(TrackingRemovalStatusBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const result = await resolveTrackingRemovalStatus(ctx.organizationId, parsed.trackings);
  return NextResponse.json({ success: true, ...result });
}, { permission: 'receiving.view' });
