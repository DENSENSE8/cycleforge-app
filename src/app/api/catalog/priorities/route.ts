import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listPriorityTiers } from '@/lib/neon/catalog-queries';

/**
 * GET /api/catalog/priorities — the org's priority-ladder overrides.
 *
 * There is no POST. The ladder's four rungs are a code constant
 * (`PRIORITY_OVERRIDE_TIERS`) and their `tier` is what `receiving.priority_tier`
 * stores, so a rung cannot be created — only renamed or repainted, which is a
 * PATCH on `[tier]`. See the migration header for why widening this is how the
 * receiving queue mis-sorts.
 *
 * An empty array is the NORMAL response: a row exists only for a rung someone
 * customised, and the client merges what it gets over the built-ins by tier.
 */
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
