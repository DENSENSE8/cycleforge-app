import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listStaffReminders } from '@/lib/reminders/list-staff-reminders';
import { staffReminderDbDeps } from '@/lib/reminders/list-staff-reminders-db';
import {
  REMINDER_WINDOW_DEFAULT_DAYS,
  reminderFeedQuerySchema,
} from '@/lib/reminders/reminder-contract';

export const runtime = 'nodejs';

/** GET /api/v1/reminders?from=&days= — the caller's reminders for the native apps to schedule as LOCAL notifications (contract: */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = reminderFeedQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'Invalid reminders query.' } },
      { status: 400 },
    );
  }
  const data = await listStaffReminders(
    ctx.organizationId,
    ctx.staffId,
    {
      fromMs: parsed.data.from ? Date.parse(parsed.data.from) : Date.now(),
      days: parsed.data.days ?? REMINDER_WINDOW_DEFAULT_DAYS,
      includeTasks: ctx.permissions.has('work_orders.claim'),
    },
    staffReminderDbDeps,
  );
  return NextResponse.json({ data }, { headers: { 'cache-control': 'no-store' } });
});
