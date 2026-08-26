/**
 * GET /api/sessions/purposes — the org's L1 catalog.
 *
 * System rows are ensured on read so a new tenant is never empty. Custom
 * purposes are created at session-start (POST /api/sessions), not here.
 * Gate rationale (no per-session permission): ../route.ts.
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { listPurposes } from '@/lib/sessions/purposes';

export const GET = withAuth(async (_req, ctx) => {
  const purposes = await listPurposes({ orgId: ctx.organizationId });
  return NextResponse.json({ purposes });
});
