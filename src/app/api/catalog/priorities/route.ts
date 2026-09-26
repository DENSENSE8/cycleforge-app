import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listPriorityTiers } from '@/lib/neon/catalog-queries';

/** GET /api/catalog/priorities — the org's priority-ladder overrides. */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    try {
      const priorities = await listPriorityTiers(ctx.organizationId);
      return NextResponse.json({ success: true, priorities });
    } catch (error: any) {
      console.error('Error in GET /api/catalog/priorities:', error);
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to fetch priority tiers' },
        { status: 500 },
      );
    }
  },
  { permission: 'receiving.view' },
);
