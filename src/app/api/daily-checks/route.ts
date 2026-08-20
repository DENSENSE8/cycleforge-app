import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadDailyCheckReport } from '@/lib/daily-checks/queries';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';

export const runtime = 'nodejs';

/**
 * GET /api/daily-checks?date=YYYY-MM-DD — one day's checklist + report.
 *
 * The report is a LIVE READ, not a stored artifact: there is no nightly job and
 * nothing to freeze, so a mark made a minute ago is in the report a minute ago
 * and a correction to a past day is reflected immediately.
 *
 * `date` is a warehouse CIVIL day and defaults to today in the warehouse zone —
 * never the server's local date, which is UTC and would roll the day over
 * mid-afternoon on the floor.
 *
 * Gate is `dashboard.view`: everyone who can open the app runs the list and can
 * read the day's report. That visibility is the point — see the Home surface.
 */
export const GET = withAuth(
  async (request, ctx) => {
    const raw = request.nextUrl.searchParams.get('date');
    if (raw && !parseDateKey(raw)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const dateKey = raw ?? getCurrentPSTDateKey();

    try {
      const report = await loadDailyCheckReport({
        orgId: ctx.organizationId,
        dateKey,
        viewerStaffId: ctx.staffId,
      });
      return NextResponse.json(report);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] report failed:', message);
      return NextResponse.json({ error: 'Failed to load the daily report' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);
