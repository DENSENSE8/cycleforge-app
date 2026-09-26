import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadDailyCheckReport } from '@/lib/daily-checks/queries';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';

export const runtime = 'nodejs';

/** GET /api/daily-checks?date=YYYY-MM-DD — one day's checklist + report. */
export const GET = withAuth(
  async (request, ctx) => {
    const raw = request.nextUrl.searchParams.get('date');
    if (raw && !parseDateKey(raw)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const dateKey = raw ?? getCurrentPSTDateKey();
    const scope = request.nextUrl.searchParams.get('scope');
    if (scope && scope !== 'mine' && scope !== 'all') {
      return NextResponse.json({ error: 'scope must be mine or all' }, { status: 400 });
    }
    if (scope === 'all' && !ctx.permissions.has('operations.view')) {
      return NextResponse.json({ error: 'The full staff report requires operations access' }, { status: 403 });
    }

    const report = await loadDailyCheckReport({
      orgId: ctx.organizationId,
      dateKey,
      viewerStaffId: ctx.staffId,
      onlyViewerItems: scope !== 'all',
    });
    return NextResponse.json(report);
  },
  { permission: 'dashboard.view' },
);
