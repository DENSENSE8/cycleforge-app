/** GET /api/sessions/purposes — the org's L1 catalog. */

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { listPurposes } from '@/lib/sessions/purposes';

export const GET = withAuth(async (_req, ctx) => {
  const purposes = await listPurposes({ orgId: ctx.organizationId });
  return NextResponse.json({ purposes });
});
