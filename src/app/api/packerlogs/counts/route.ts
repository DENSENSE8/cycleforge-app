import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchPackerLogRows } from '@/lib/neon/packer-logs-week';
import { toPSTDateKey } from '@/utils/date';

/** Packer-logs COUNTS sibling (station-table-unification-plan §5 / §7.2). */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const packerIdParam = searchParams.get('packerId') || searchParams.get('packedBy');
  const staffParam = searchParams.get('staff');
  const weekStart = searchParams.get('weekStart') || '';
  const weekEnd = searchParams.get('weekEnd') || '';

  const packerIdNum = packerIdParam ? parseInt(packerIdParam) : null;
  const staffNum = staffParam ? parseInt(staffParam) : null;

  const { rows } = await fetchPackerLogRows({
    organizationId: ctx.organizationId,
    packerId: packerIdNum != null && !Number.isNaN(packerIdNum) ? packerIdNum : null,
    staffId: staffNum != null && !Number.isNaN(staffNum) ? staffNum : null,
    limit: 500,
    offset: 0,
    weekStart,
    weekEnd,
  });

  const byDay: Record<string, number> = {};
  for (const r of rows) {
    let day = 'Unknown';
    try {
      day = toPSTDateKey(r.created_at) || 'Unknown';
    } catch {
      day = 'Unknown';
    }
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  return NextResponse.json({ total: rows.length, byDay, truncated: rows.length >= 500 });
}, { permission: 'packing.view' });
