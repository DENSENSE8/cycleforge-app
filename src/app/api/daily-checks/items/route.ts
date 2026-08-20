import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { createDailyCheckItem, retireDailyCheckItem } from '@/lib/daily-checks/queries';
import { getCurrentPSTDateKey } from '@/utils/date';

export const runtime = 'nodejs';

const CreateBody = z.object({ title: z.string().trim().min(1).max(200) });

/**
 * POST /api/daily-checks/items — append an item to the daily list.
 *
 * Live from TODAY (warehouse civil day), never retroactively: back-dating
 * `effective_from` would make yesterday's report show a missed item that did
 * not exist when the shift ran.
 *
 * Audited — unlike the per-day ticks. Changing the LIST changes what every
 * future report measures, and it is rare, so it earns an audit row; a tick is
 * already attributed by the mark itself.
 */
export const POST = withAuth(
  async (request, ctx) => {
    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'title is required (1–200 chars)' }, { status: 400 });
    }

    try {
      const item = await createDailyCheckItem({
        orgId: ctx.organizationId,
        title: parsed.data.title,
        effectiveFrom: getCurrentPSTDateKey(),
      });

      await recordAudit(pool, ctx, request, {
        source: 'home-daily',
        action: AUDIT_ACTION.DAILY_CHECK_ITEM_CREATE,
        entityType: AUDIT_ENTITY.DAILY_CHECK_ITEM,
        entityId: String(item.id),
        after: { title: item.title, sortOrder: item.sortOrder },
      });

      return NextResponse.json(item, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] item create failed:', message);
      return NextResponse.json({ error: 'Failed to add the item' }, { status: 500 });
    }
  },
  { permission: 'admin.manage_staff' },
);

/**
 * DELETE /api/daily-checks/items?id=123 — retire an item from today onward.
 *
 * A RETIRE, not a delete. Marks reference the item, and every past report that
 * included it must keep rendering it — dropping the row would rewrite history
 * to say the check was never on the list.
 */
export const DELETE = withAuth(
  async (request, ctx) => {
    const raw = request.nextUrl.searchParams.get('id');
    const itemId = Number(raw);
    if (!raw || !Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
    }

    try {
      const retiredAt = getCurrentPSTDateKey();
      const retired = await retireDailyCheckItem({ orgId: ctx.organizationId, itemId, retiredAt });
      if (!retired) {
        // Already retired, or not this tenant's row. Both are "nothing to do"
        // rather than an error the operator can act on.
        return NextResponse.json({ ok: true, changed: false });
      }

      await recordAudit(pool, ctx, request, {
        source: 'home-daily',
        action: AUDIT_ACTION.DAILY_CHECK_ITEM_RETIRE,
        entityType: AUDIT_ENTITY.DAILY_CHECK_ITEM,
        entityId: String(itemId),
        after: { retiredAt },
      });

      return NextResponse.json({ ok: true, changed: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] item retire failed:', message);
      return NextResponse.json({ error: 'Failed to retire the item' }, { status: 500 });
    }
  },
  { permission: 'admin.manage_staff' },
);
