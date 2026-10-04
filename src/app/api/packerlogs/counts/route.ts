import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { countPackerLogsByDay } from '@/lib/fulfillment/packer-log-counts';

/** Positive integer param, else unset. */
function staffIdParam(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Packer-logs COUNTS sibling (station-table-unification-plan §5 / §7.2):
 * Fulfilled packages per warehouse day, counted in SQL (no row cap).
 * `truncated` stays in the payload for its readers; a SQL count never is.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const { total, byDay } = await countPackerLogsByDay(ctx.organizationId, {
    packerId: staffIdParam(searchParams.get('packerId') || searchParams.get('packedBy')),
    staffId: staffIdParam(searchParams.get('staff')),
    weekStart: searchParams.get('weekStart') || '',
    weekEnd: searchParams.get('weekEnd') || '',
  });
  return NextResponse.json({ total, byDay, truncated: false });
}, { permission: 'packing.view' });
