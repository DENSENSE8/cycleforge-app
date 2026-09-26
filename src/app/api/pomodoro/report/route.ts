import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { PomodoroReportQuery } from '@/lib/pomodoro/contract';
import { loadPomodoroReport } from '@/lib/pomodoro/report';
import { pomodoroReportDbDeps } from '@/lib/pomodoro/report-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Manager-only actor/record/day drilldown; focus seconds are not lifecycle wall time. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = req.nextUrl;
  const staffId = searchParams.get('staffId');
  const parsed = PomodoroReportQuery.safeParse({
    ...Object.fromEntries(searchParams),
    ...(staffId !== null ? { staffId: Number(staffId) } : {}),
  });
  if (!parsed.success) return NextResponse.json(
    { ok: false, error: 'Invalid report range (maximum 31 days)' }, { status: 400 },
  );
  return NextResponse.json(await loadPomodoroReport({
    orgId: ctx.organizationId, ...parsed.data,
  }, pomodoroReportDbDeps));
}, { permission: 'operations.view' });
