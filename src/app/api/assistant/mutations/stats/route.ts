import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getMutationTrustStats } from '@/lib/assistant/mutations/trust-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/assistant/mutations/stats — per-kind accept/reject stats for the org's agent_mutations (universal-feed plan Phase 5). */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    const stats = await getMutationTrustStats(ctx.organizationId);
    return NextResponse.json({ success: true, stats });
  },
  { permission: 'studio.manage' },
);
