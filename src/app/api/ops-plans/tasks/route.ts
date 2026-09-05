import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { CreateDeskTaskBody, DeskTasksQuerySchema } from '@/lib/schemas/ops-plans';
import { createTaskForPlan, listTasksForInbox } from '@/lib/ops-plans/queries';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  mapOpsPlanError,
  scheduleOpsPlanSideEffects,
} from '@/lib/ops-plans/side-effects';

export const runtime = 'nodejs';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = DeskTasksQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_QUERY', issues: parsed.error.issues }, { status: 400 });
  }
  const q = parsed.data;
  const scope = q.scope ?? (q.staffId === undefined ? 'mine' : undefined);
  let staffId: number | undefined;
  if (scope === 'mine' || q.staffId === 'mine') {
    staffId = ctx.staffId;
  } else if (typeof q.staffId === 'number') {
    staffId = q.staffId;
  }

  const tasks = await listTasksForInbox(ctx.organizationId, {
    planId: q.planId ?? null,
    staffId,
    status: q.status ?? 'open',
  });

  const needle = (q.q ?? '').trim().toLowerCase();
  const filtered = needle
    ? tasks.filter((task) => {
        const hay = [task.title, task.planTitle, task.assigneeName, task.notes].join(' ').toLowerCase();
        return hay.includes(needle);
      })
    : tasks;

  return NextResponse.json(
    { tasks: filtered },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { permission: 'operations.plans.view' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(CreateDeskTaskBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const result = await createTaskForPlan(ctx.organizationId, parsed.planId, {
      title: parsed.title,
      assigneeStaffId: parsed.assigneeStaffId ?? ctx.staffId,
      dueAt: parsed.dueAt ?? null,
      notes: parsed.notes ?? null,
      sortOrder: parsed.sortOrder,
      clientEventId: parsed.clientEventId ?? null,
    });
    if (!result) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    scheduleOpsPlanSideEffects(ctx.organizationId, result.planId, 'task_assigned', {
      ctx,
      req,
      taskId: result.task.id,
      audit: {
        action: AUDIT_ACTION.OPS_PLAN_TASK_CREATE,
        entityType: AUDIT_ENTITY.OPS_PLAN_TASK,
        entityId: result.task.id,
        after: result.task,
      },
    });

    return NextResponse.json(
      { task: result.task, planId: result.planId, idempotent: result.idempotent ?? false },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (err) {
    const mapped = mapOpsPlanError(err);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}, { permission: 'operations.plans.manage' });
