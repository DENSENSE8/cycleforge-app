import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOnboardingStats } from '@/lib/onboarding/stats';

/** GET /api/onboarding/stats — org-scoped activation counts for the Getting-Started checklist (onboarding-foundational-plan §8, O1). */
export const GET = withAuth(async (_request: NextRequest, ctx) => {
  const stats = await getOnboardingStats(ctx.organizationId);
  return NextResponse.json({ success: true, stats });
}, { permission: 'dashboard.view' });
