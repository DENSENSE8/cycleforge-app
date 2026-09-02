/**
 * GET /api/sessions/daily — org-wide staff × day session report.
 * Anyone with reports.view can read every staffer's day (test window).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listSessionDayIntervals, listSessionDayRows } from '@/lib/sessions/session-day-report';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';

export const runtime = 'nodejs';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : getCurrentPSTDateKey();
  const staffRaw = searchParams.get('staff');
  const staffId = staffRaw && /^\d+$/.test(staffRaw) ? Number(staffRaw) : null;

  const rows = await listSessionDayRows(ctx.organizationId, dateKey);
  const intervals =
    staffId != null
      ? await listSessionDayIntervals(ctx.organizationId, dateKey, staffId)
      : [];

  return NextResponse.json({
    success: true,
    date: dateKey,
    rows,
    intervals,
  });
}, { permission: 'reports.view' });
