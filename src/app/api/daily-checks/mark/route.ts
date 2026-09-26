import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import {
  clearDailyCheckMarks,
  dailyCheckItemBelongsToStaff,
  markDailyCheck,
  unmarkDailyCheck,
} from '@/lib/daily-checks/queries';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';

export const runtime = 'nodejs';

const Body = z.object({
  itemId: z.number().int().positive(),
  /** false = untick. A mis-tap must be reversible or operators stop trusting the list. */
  checked: z.boolean(),
  /** Warehouse civil day; defaults to today in the warehouse zone. */
  date: z.string().optional(),
  note: z.string().max(500).nullish(),
});

/** POST /api/daily-checks/mark — tick or untick ONE item for the CALLER. */
export const POST = withAuth(
  async (request, ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { itemId, checked, date, note } = parsed.data;

    if (date && !parseDateKey(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const dateKey = date ?? getCurrentPSTDateKey();

    try {
      if (!(await dailyCheckItemBelongsToStaff({
        orgId: ctx.organizationId,
        itemId,
        staffId: ctx.staffId,
      }))) {
        return NextResponse.json({ error: 'That task belongs to another staff member' }, { status: 403 });
      }
      const changed = checked
        ? await markDailyCheck({
            orgId: ctx.organizationId,
            itemId,
            staffId: ctx.staffId,
            dateKey,
            note: note ?? null,
          })
        : await unmarkDailyCheck({
            orgId: ctx.organizationId,
            itemId,
            staffId: ctx.staffId,
            dateKey,
          });

      return NextResponse.json({ ok: true, checked, changed, dateKey });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] mark failed:', message);
      return NextResponse.json({ error: 'Failed to save the check' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);

/** DELETE /api/daily-checks/mark?date=YYYY-MM-DD — "reset all" for the CALLER. */
export const DELETE = withAuth(
  async (request, ctx) => {
    const date = new URL(request.url).searchParams.get('date');
    if (date && !parseDateKey(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const dateKey = date ?? getCurrentPSTDateKey();

    try {
      const cleared = await clearDailyCheckMarks({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
        dateKey,
      });
      return NextResponse.json({ ok: true, cleared, dateKey });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] reset failed:', message);
      return NextResponse.json({ error: 'Failed to reset the checks' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);
