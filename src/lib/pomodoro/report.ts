import type { PomodoroReport, PomodoroReportEvent, PomodoroReportRow, PomodoroTaskLifecycle } from './contract';
import { taskDeskTitle } from '@/lib/tasks/task-desk-row';
import { taskEntityFromEnum } from '@/lib/tasks/task-vocabulary';

export interface ActivityRow {
  event_id: string;
  staff_id: number;
  staff_name: string | null;
  assignment_id: number | string | null;
  daily_check_item_id: string | number | null;
  check_date: string | null;
  event_day: string;
  event_type: 'viewed' | 'worked' | 'completed';
  source: string;
  occurred_at: Date;
  duration_ms: string | number | null;
  title: string | null;
  target_entity_type: string | null;
  target_entity_id: string | number | null;
  lifecycle_started_at: Date | null;
}

export interface SessionDayRow {
  staff_id: number;
  staff_name: string | null;
  assignment_id: number | null;
  daily_check_item_id: string | number | null;
  check_date: string | null;
  event_day: string;
  duration_ms: string | number;
  title: string | null;
  target_entity_type: string | null;
  target_entity_id: string | number | null;
}

export interface PomodoroReportDeps {
  fetchActivity(args: ReportArgs): Promise<ActivityRow[]>;
  fetchSessionDays(args: ReportArgs): Promise<SessionDayRow[]>;
}

export interface ReportArgs {
  orgId: string;
  from: string;
  to: string;
  staffId?: number;
}

/** Session time is measured focus; task lifecycle is separately labeled wall-clock. */
export function buildPomodoroReport(args: ReportArgs, activity: ActivityRow[], sessions: SessionDayRow[]): PomodoroReport {
  const rows = new Map<string, PomodoroReportRow>();
  const focusMs = new Map<string, number>();
  const events: PomodoroReportEvent[] = [];
  const taskLifecycles: PomodoroTaskLifecycle[] = [];
  const rowFor = (data: {
    staff_id: number; staff_name: string | null;
    assignment_id: number | string | null; daily_check_item_id: number | string | null;
    check_date: string | null; event_day: string; title: string | null;
    target_entity_type: string | null; target_entity_id: number | string | null;
  }) => {
    const kind = data.assignment_id === null ? 'checklist' : 'task';
    const id = Number(data.assignment_id ?? data.daily_check_item_id);
    const key = `${data.staff_id}:${kind}:${id}:${data.event_day}:${data.check_date ?? ''}`;
    const entityType = taskEntityFromEnum(data.target_entity_type);
    const entityId = data.target_entity_id == null ? null : Number(data.target_entity_id);
    let row = rows.get(key);
    if (!row) {
      row = {
        staffId: data.staff_id, staffName: data.staff_name, kind, id, date: data.event_day,
        checkDate: data.check_date,
        title: kind === 'checklist'
          ? data.title?.trim() || `Checklist #${id}`
          : data.title?.trim() && entityType && entityId !== null
            ? taskDeskTitle({ note: data.title, entityType, entityId })
            : `Task #${id}`,
        targetEntityType: entityType,
        targetEntityId: entityId,
        viewedAt: [], workedAt: [], completedAt: [], measuredFocusSeconds: 0,
      };
      rows.set(key, row);
    }
    return { row, key };
  };

  for (const fact of activity) {
    const { row } = rowFor(fact);
    const at = fact.occurred_at.toISOString();
    const list = fact.event_type === 'viewed' ? row.viewedAt
      : fact.event_type === 'worked' ? row.workedAt : row.completedAt;
    list.push(at);
    if (fact.event_type === 'completed' && row.kind === 'task' && fact.lifecycle_started_at) {
      taskLifecycles.push({
        taskId: row.id, date: row.date, startedAt: fact.lifecycle_started_at.toISOString(),
        completedAt: at,
        elapsedSeconds: Math.max(0, Math.floor(
          (fact.occurred_at.getTime() - fact.lifecycle_started_at.getTime()) / 1000,
        )),
      });
    }
    events.push({
      eventId: fact.event_id, staffId: row.staffId, staffName: row.staffName,
      kind: row.kind, id: row.id,
      date: row.date, checkDate: row.checkDate, event: fact.event_type, at,
      source: fact.source, durationSeconds: fact.duration_ms === null ? null : Number(fact.duration_ms) / 1000,
      title: row.title, targetEntityType: row.targetEntityType, targetEntityId: row.targetEntityId,
    });
  }

  for (const day of sessions) {
    const { key } = rowFor(day);
    focusMs.set(key, (focusMs.get(key) ?? 0) + Number(day.duration_ms));
  }
  for (const [key, milliseconds] of focusMs) {
    rows.get(key)!.measuredFocusSeconds = Math.floor(milliseconds / 1000);
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
  for (const row of rows.values()) {
    row.viewedAt.sort();
    row.workedAt.sort();
    row.completedAt.sort();
  }
  return {
    ok: true, from: args.from, to: args.to,
    rows: [...rows.values()].sort((a, b) => b.date.localeCompare(a.date)
      || a.staffId - b.staffId || a.kind.localeCompare(b.kind) || a.id - b.id),
    events,
    taskLifecycles: taskLifecycles.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.taskId - b.taskId),
  };
}

export async function loadPomodoroReport(args: ReportArgs, deps: PomodoroReportDeps): Promise<PomodoroReport> {
  const [activity, sessions] = await Promise.all([deps.fetchActivity(args), deps.fetchSessionDays(args)]);
  return buildPomodoroReport(args, activity, sessions);
}
