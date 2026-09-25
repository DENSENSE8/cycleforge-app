import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { AuthContext } from '@/lib/auth/auth-context';
import pool from '@/lib/db';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { PomodoroCommand, PomodoroTarget, type PomodoroTarget as Target } from '@/lib/pomodoro/contract';
import { changePomodoro, PomodoroRefusal, readPomodoro, viewPomodoro } from '@/lib/pomodoro/timer';
import { pomodoroDbDeps } from '@/lib/pomodoro/timer-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function refusal(error: unknown): NextResponse {
  if (error instanceof PomodoroRefusal) {
    return NextResponse.json({ ok: false, error: error.reason }, {
      status: error.reason === 'not_found' ? 404 : 409,
    });
  }
  console.error('[pomodoro] request failed:', error);
  return NextResponse.json({ ok: false, error: 'Failed to load timer' }, { status: 500 });
}

function access(ctx: AuthContext, target: Target): NextResponse | null {
  const required = target.kind === 'task' ? 'work_orders.claim' : 'dashboard.view';
  return ctx.permissions.has(required) ? null : NextResponse.json(
    { ok: false, error: 'FORBIDDEN', permission: required }, { status: 403 },
  );
}

/** GET /api/pomodoro?kind=task&id=123 or kind=checklist&id=456&date=YYYY-MM-DD. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  // URL values arrive as strings; ids are the only values converted from URL input.
  const raw = Object.fromEntries(req.nextUrl.searchParams);
  const target = PomodoroTarget.safeParse({ ...raw, id: Number(raw.id) });
  if (!target.success) return NextResponse.json({ ok: false, error: 'Invalid timer target' }, { status: 400 });
  const denied = access(ctx, target.data);
  if (denied) return denied;
  try {
    return NextResponse.json(await readPomodoro(ctx.organizationId, ctx.staffId, target.data, pomodoroDbDeps));
  } catch (error) {
    return refusal(error);
  }
});

/** POST /api/pomodoro {kind,id,date?,action:start|pause|reset_cycle|view,clientEventId?}. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => null);
  const parsed = PomodoroCommand.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid timer action' }, { status: 400 });
  const { action } = parsed.data;
  const target: Target = parsed.data.kind === 'task'
    ? { kind: 'task', id: parsed.data.id }
    : { kind: 'checklist', id: parsed.data.id, date: parsed.data.date };
  const denied = access(ctx, target);
  if (denied) return denied;
  try {
    const result = parsed.data.action === 'view'
      ? await viewPomodoro(ctx.organizationId, ctx.staffId, target, parsed.data.clientEventId, pomodoroDbDeps)
      : await changePomodoro(ctx.organizationId, ctx.staffId, target, parsed.data.action, pomodoroDbDeps);
    if (result.changed && action !== 'view') {
      await recordAudit(pool, ctx, req, {
        source: 'pomodoro-api',
        action: action === 'start' ? AUDIT_ACTION.POMODORO_START
          : action === 'pause' ? AUDIT_ACTION.POMODORO_PAUSE : AUDIT_ACTION.POMODORO_RESET_CYCLE,
        entityType: AUDIT_ENTITY.POMODORO_TIMER,
        entityId: target.kind === 'task' ? `task:${target.id}` : `checklist:${target.id}:${target.date}`,
        after: { elapsedSeconds: result.timer?.elapsedSeconds, running: result.timer?.running },
        extra: { target },
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return refusal(error);
  }
});
