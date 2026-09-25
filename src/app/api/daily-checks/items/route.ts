import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import {
  createDailyCheckItem,
  dailyCheckStaffExists,
  retireDailyCheckItem,
  updateDailyCheckItem,
} from '@/lib/daily-checks/queries';
import { getCurrentPSTDateKey } from '@/utils/date';
import { CIVIL_TIME_RE, REMIND_OFFSET_MAX_MINUTES } from '@/lib/reminders/reminder-contract';

export const runtime = 'nodejs';

/** Civil `HH:MM` (warehouse zone) — what `daily_check_items.due_time` stores. */
const DueTime = z.string().regex(CIVIL_TIME_RE, 'dueTime must be HH:MM (24h)');
const RemindOffset = z.number().int().min(0).max(REMIND_OFFSET_MAX_MINUTES);

const OFFSET_NEEDS_DUE_TIME = 'A reminder needs a due time';

const CreateBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    /** Context belongs to the item; this route adds no per-mark note. */
    description: z.string().trim().max(2000).nullish(),
    /** Cadence, not subject: `once` also writes the one-day window below. */
    kind: z.enum(['recurring', 'once']).default('recurring'),
    assignedStaffId: z.number().int().positive().nullish(),
    /** The emoji character itself, ≤8 chars (ZWJ sequences run long). */
    glyph: z.string().min(1).max(8).nullish(),
    /** Due every live day at this civil time; read by `GET /api/v1/reminders`. */
    dueTime: DueTime.nullish(),
    remindOffsetMinutes: RemindOffset.nullish(),
  })
  .superRefine(({ kind, assignedStaffId, dueTime, remindOffsetMinutes }, ctx) => {
    if (kind === 'recurring' && assignedStaffId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedStaffId'],
        message: 'Only a just-today task can be assigned to one staff member',
      });
    }
    if (remindOffsetMinutes != null && dueTime == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindOffsetMinutes'],
        message: OFFSET_NEEDS_DUE_TIME,
      });
    }
  });

/**
 * POST /api/daily-checks/items — append an item to the daily list.
 *
 * Live from TODAY (warehouse civil day), never retroactively: back-dating
 * `effective_from` would make yesterday's report show a missed item that did
 * not exist when the shift ran. A `once` item additionally closes its window
 * tomorrow (same statement), so it is gone from the list without a sweep job.
 *
 * Audited — unlike the per-day ticks. Changing the LIST changes what every
 * future report measures, and it is rare, so it earns an audit row; a tick is
 * already attributed by the mark itself.
 */
export const POST = withAuth(
  async (request, ctx) => {
    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? 'title is required (1–200 chars)' },
        { status: 400 },
      );
    }
    const { title, description, kind, glyph } = parsed.data;
    const dueTime = parsed.data.dueTime ?? null;
    const remindOffsetMinutes = parsed.data.remindOffsetMinutes ?? null;
    const assignedStaffId = parsed.data.assignedStaffId ?? null;

    // A stale client can name an owner who no longer exists; the FK would 500,
    // and an operator-facing 400 is the answer they can act on.
    if (assignedStaffId != null) {
      const ownerKnown = await dailyCheckStaffExists({
        orgId: ctx.organizationId,
        staffId: assignedStaffId,
      });
      if (!ownerKnown) {
        return NextResponse.json({ error: 'That staff member no longer exists' }, { status: 400 });
      }
    }

    try {
      const item = await createDailyCheckItem({
        orgId: ctx.organizationId,
        title,
        description: description?.trim() || null,
        effectiveFrom: getCurrentPSTDateKey(),
        kind,
        assignedStaffId: assignedStaffId ?? null,
        glyph: glyph ?? null,
        dueTime,
        remindOffsetMinutes,
      });

      await recordAudit(pool, ctx, request, {
        source: 'home-daily',
        action: AUDIT_ACTION.DAILY_CHECK_ITEM_CREATE,
        entityType: AUDIT_ENTITY.DAILY_CHECK_ITEM,
        entityId: String(item.id),
        after: {
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          kind: item.kind,
          assignedStaffId: item.assignedStaffId,
          glyph: item.glyph,
          dueTime: item.dueTime,
          remindOffsetMinutes: item.remindOffsetMinutes,
        },
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
 * Every field optional, at least one present. `dueTime: null` clears the due
 * time AND its reminder; an offset with `dueTime: null` in the same body is a
 * contradiction and refused here, while an offset on an item whose STORED due
 * time is null is refused by the named CHECK (see `updateDailyCheckItem`).
 */
const UpdateBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueTime: DueTime.nullable().optional(),
    remindOffsetMinutes: RemindOffset.nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.title === undefined && body.dueTime === undefined && body.remindOffsetMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Send a title, dueTime or remindOffsetMinutes',
      });
    }
    if (body.dueTime === null && body.remindOffsetMinutes != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindOffsetMinutes'],
        message: OFFSET_NEEDS_DUE_TIME,
      });
    }
  });

/**
 * PATCH /api/daily-checks/items?id=123 — correct a live item's title, and/or
 * set its due time and reminder.
 *
 * NOT cadence or owner. `kind` and `assignedStaffId` feed the per-staff
 * denominator in `buildDailyCheckReport`, so editing them re-does the
 * arithmetic of every past report, not just its wording; the correction verb
 * for those is retire + add. A title, by contrast, is not versioned on
 * purpose — the marks keep pointing at the same item id, and the audit row
 * below is how a manager sees that last month's wording changed. A due time
 * only moves when the item rings.
 *
 * Audited with BEFORE and AFTER of exactly the fields sent, which is the whole
 * point of auditing an edit: the action alone says nothing a reader can act on.
 *
 * "Live" is the item's WINDOW on today's civil day, not `retired_at IS NULL` —
 * a `once` item is born already carrying tomorrow's `retired_at`, so the
 * null-check spelled in the handoff would 404 every one-off, which is every row
 * the phone's Ticket face writes.
 */
export const PATCH = withAuth(
  async (request, ctx) => {
    const raw = request.nextUrl.searchParams.get('id');
    const itemId = Number(raw);
    if (!raw || !Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
    }

    const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? 'Send a title, dueTime or remindOffsetMinutes' },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    try {
      const updated = await updateDailyCheckItem({
        orgId: ctx.organizationId,
        itemId,
        patch,
        // The warehouse civil day, never `now()::date`: the server clock is UTC
        // and rolls over mid-afternoon, which would drop a one-off out of its
        // own window and 404 an edit the operator is looking straight at.
        dayKey: getCurrentPSTDateKey(),
      });
      if (!updated.ok) {
        // not_found = nothing by that id on today's list in this tenant (gone,
        // or never here): the operator is editing something the list does not
        // have.
        return updated.reason === 'not_found'
          ? NextResponse.json({ error: 'No such item' }, { status: 404 })
          : NextResponse.json({ error: OFFSET_NEEDS_DUE_TIME }, { status: 400 });
      }

      // Exactly the fields this edit touched. Clearing the due time also
      // clears the reminder, so that change is recorded too.
      const touched = (Object.keys(patch) as Array<keyof typeof patch>).filter(
        (key) => patch[key] !== undefined,
      );
      if (patch.dueTime === null && !touched.includes('remindOffsetMinutes')) {
        touched.push('remindOffsetMinutes');
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of touched) {
        before[key] = updated.previous[key];
        after[key] = updated.item[key];
      }

      await recordAudit(pool, ctx, request, {
        source: 'home-daily',
        action: AUDIT_ACTION.DAILY_CHECK_ITEM_UPDATE,
        entityType: AUDIT_ENTITY.DAILY_CHECK_ITEM,
        entityId: String(itemId),
        before,
        after,
      });

      return NextResponse.json(updated.item);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[daily-checks] item update failed:', message);
      return NextResponse.json({ error: 'Failed to save the item' }, { status: 500 });
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
