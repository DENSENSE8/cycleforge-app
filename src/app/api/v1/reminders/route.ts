import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data } from '@/lib/api/v1-route';
import { listStaffReminders } from '@/lib/reminders/list-staff-reminders';
import { staffReminderDbDeps } from '@/lib/reminders/list-staff-reminders-db';
import {
  REMINDER_WINDOW_DEFAULT_DAYS,
  reminderFeedQuerySchema,
} from '@/lib/reminders/reminder-contract';

export const runtime = 'nodejs';

/** GET /api/v1/reminders?from=&days= — the caller's reminders for the native apps to schedule as LOCAL notifications. */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, reminderFeedQuerySchema, 'Invalid reminders query.');
  if (!query.ok) return query.response;
  const data = await listStaffReminders(
    ctx.organizationId,
    ctx.staffId,
    {
      fromMs: query.data.from ? Date.parse(query.data.from) : Date.now(),
      days: query.data.days ?? REMINDER_WINDOW_DEFAULT_DAYS,
      includeTasks: ctx.permissions.has('work_orders.claim'),
    },
    staffReminderDbDeps,
  );
  return v1Data(data);
});
