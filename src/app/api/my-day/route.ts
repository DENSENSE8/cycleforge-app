import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { aggregateMyDayFeed } from '@/lib/my-day/aggregate-my-day';

export const runtime = 'nodejs';

/**
 * GET /api/my-day — BFF for the My Day workbench at `/`.
 * Composes work_assignments, inbox interrupts, and permission-filtered queue cards.
 */
export const GET = withAuth(async (_req, ctx) => {
  try {
    const feed = await aggregateMyDayFeed({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      permissions: ctx.permissions,
    });
    return NextResponse.json(feed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[my-day] feed failed:', message);
    return NextResponse.json({ error: 'Failed to load My Day feed', details: message }, { status: 500 });
  }
});