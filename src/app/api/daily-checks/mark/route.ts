import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { markDailyCheck, unmarkDailyCheck } from '@/lib/daily-checks/queries';
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

/**
 * POST /api/daily-checks/mark — tick or untick ONE item for the CALLER.
 *
 * `staffId` comes from the verified session, never the body: a mark is an
 * attestation, and letting a caller name someone else would make the report
 * evidence of nothing.
 *
 * NO AUDIT ROW, deliberately. `daily_check_marks` already carries staff_id +
 * marked_at + marked_on for every tick — the table IS the attribution trail, so
 * an audit_logs row would be a second copy of the same fact written six times
 * per person per day. The structural changes (adding / retiring an item) DO
 * audit; see the items route.
 *
 * Idempotent: the unique index makes a double-tap or a retried request a no-op,
 * so the response reports `changed` rather than pretending each call did work.
 */
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
