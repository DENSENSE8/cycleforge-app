import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { PomodoroDeps, TimerRow, TimerTransaction } from './timer';
import type { PomodoroTarget } from './contract';

interface DbRow {
  assignment_id: number | null;
  daily_check_item_id: number | string | null;
  date: string | null;
  accumulated_ms: number | string;
  cycle_origin_ms: number | string;
  started_at: Date | null;
}

function fromDb(row: DbRow): TimerRow {
  return {
    target: row.assignment_id !== null
      ? { kind: 'task', id: Number(row.assignment_id) }
      : { kind: 'checklist', id: Number(row.daily_check_item_id), date: row.date! },
    accumulatedMs: Number(row.accumulated_ms),
    cycleOriginMs: Number(row.cycle_origin_ms),
    startedAt: row.started_at,
  };
}

const SELECT_TIMER = `
  SELECT assignment_id, daily_check_item_id,
         to_char(check_date, 'YYYY-MM-DD') AS date,
         accumulated_ms, cycle_origin_ms, started_at
    FROM pomodoro_timers
   WHERE organization_id = $1 AND staff_id = $2
`;

export const pomodoroDbDeps: PomodoroDeps = {
  transaction: (orgId, fn) => withTenantTransaction(orgId, async (client) => {
    const tx: TimerTransaction = {
      guardTarget: async (scopeOrgId, target) => {
        if (target.kind === 'task') {
          await client.query(
            `SELECT id FROM work_assignments
              WHERE organization_id = $1 AND id = $2 AND work_type = 'FOLLOW_UP'
              FOR SHARE`,
            [scopeOrgId, target.id],
          );
        }
      },
      lockStaff: async (staffId) => {
        await client.query('SELECT pg_advisory_xact_lock(974126, $1::int)', [staffId]);
      },
      now: async () => {
        const result = await client.query<{ stamp: Date }>('SELECT clock_timestamp() AS stamp');
        return result.rows[0].stamp;
      },
      targetState: async (scopeOrgId, staffId, target) => {
        if (target.kind === 'task') {
          const result = await client.query<{ status: string }>(
            `SELECT status::text AS status FROM work_assignments
              WHERE organization_id = $1 AND id = $2 AND work_type = 'FOLLOW_UP'`,
            [scopeOrgId, target.id],
          );
          if (!result.rows[0]) return 'missing';
          return result.rows[0].status === 'DONE' || result.rows[0].status === 'CANCELED'
            ? 'completed' : 'open';
        }
        const result = await client.query<{ marked: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM daily_check_marks m
              WHERE m.organization_id = i.organization_id AND m.item_id = i.id
                AND m.staff_id = $3 AND m.marked_on = $4::date
           ) AS marked
             FROM daily_check_items i
            WHERE i.organization_id = $1 AND i.id = $2
              AND i.effective_from <= $4::date
              AND (i.retired_at IS NULL OR i.retired_at > $4::date)`,
          [scopeOrgId, target.id, staffId, target.date],
        );
        if (!result.rows[0]) return 'missing';
        return result.rows[0].marked ? 'completed' : 'open';
      },
      timer: async (scopeOrgId, staffId, target) => {
        const result = await client.query<DbRow>(
          `${SELECT_TIMER} AND ${target.kind === 'task' ? 'assignment_id = $3' : 'daily_check_item_id = $3 AND check_date = $4::date'}`,
          target.kind === 'task'
            ? [scopeOrgId, staffId, target.id]
            : [scopeOrgId, staffId, target.id, target.date],
        );
        return result.rows[0] ? fromDb(result.rows[0]) : null;
      },
      active: async (scopeOrgId, staffId) => {
        const result = await client.query<DbRow>(
          `${SELECT_TIMER} AND started_at IS NOT NULL`, [scopeOrgId, staffId],
        );
        return result.rows[0] ? fromDb(result.rows[0]) : null;
      },
      insert: async (scopeOrgId, staffId, target, now) => {
        await client.query(
          `INSERT INTO pomodoro_timers
            (organization_id, staff_id, assignment_id, daily_check_item_id, check_date, started_at)
           VALUES ($1, $2, $3, $4, $5::date, $6)`,
          [scopeOrgId, staffId, target.kind === 'task' ? target.id : null,
            target.kind === 'checklist' ? target.id : null,
            target.kind === 'checklist' ? target.date : null, now],
        );
      },
      save: async (scopeOrgId, staffId, timer) => {
        const target: PomodoroTarget = timer.target;
        await client.query(
          `UPDATE pomodoro_timers
              SET accumulated_ms = $1, cycle_origin_ms = $2, started_at = $3,
                  updated_at = clock_timestamp()
            WHERE organization_id = $4 AND staff_id = $5
              AND ${target.kind === 'task' ? 'assignment_id = $6' : 'daily_check_item_id = $6 AND check_date = $7::date'}`,
          [timer.accumulatedMs, timer.cycleOriginMs, timer.startedAt, scopeOrgId, staffId,
            target.id, ...(target.kind === 'checklist' ? [target.date] : [])],
        );
      },
      recordView: async (scopeOrgId, staffId, target, clientEventId, now) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO pomodoro_activity_events (
            organization_id, staff_id, assignment_id, daily_check_item_id,
            check_date, event_day, event_type, source, occurred_at, client_event_id
           ) VALUES (
            $1, $2, $3, $4, $5::date,
            ($6::timestamptz AT TIME ZONE 'America/Los_Angeles')::date,
            'viewed', 'panel_open', $6, $7::uuid
           )
           ON CONFLICT (organization_id, staff_id, client_event_id)
             WHERE client_event_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [scopeOrgId, staffId, target.kind === 'task' ? target.id : null,
            target.kind === 'checklist' ? target.id : null,
            target.kind === 'checklist' ? target.date : null, now, clientEventId],
        );
        if (inserted.rows[0]) return 'inserted';
        const previous = await client.query<{
          assignment_id: number | null; daily_check_item_id: number | string | null; date: string | null;
        }>(
          `SELECT assignment_id, daily_check_item_id,
                  to_char(check_date, 'YYYY-MM-DD') AS date
             FROM pomodoro_activity_events
            WHERE organization_id = $1 AND staff_id = $2 AND client_event_id = $3::uuid`,
          [scopeOrgId, staffId, clientEventId],
        );
        const row = previous.rows[0];
        return row && (target.kind === 'task'
          ? Number(row.assignment_id) === target.id
          : Number(row.daily_check_item_id) === target.id && row.date === target.date)
          ? 'duplicate' : 'conflict';
      },
    };
    return fn(tx);
  }),
};
