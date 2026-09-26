import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listPriorityTiers } from '@/lib/neon/catalog-queries';

/** GET /api/catalog/priorities — the org's priority-ladder overrides. */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    const priorities = await listPriorityTiers(ctx.organizationId);
    return NextResponse.json({ success: true, priorities });
  },
  { permission: 'receiving.view' },
);
