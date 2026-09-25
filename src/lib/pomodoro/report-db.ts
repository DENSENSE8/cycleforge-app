import 'server-only';
import { tenantQuery } from '@/lib/tenancy/db';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { ActivityRow, PomodoroReportDeps, SessionDayRow } from './report';

const TASK_INTERACTIONS = [
  AUDIT_ACTION.WORK_TASK_LINK_ADD, AUDIT_ACTION.WORK_TASK_LINK_REMOVE,
  AUDIT_ACTION.WORK_TASK_DOC_ADD, AUDIT_ACTION.WORK_TASK_DOC_REMOVE,
  AUDIT_ACTION.WORK_TASK_MEDIA_LINK_ADD, AUDIT_ACTION.WORK_TASK_MEDIA_LINK_UPDATE,
  AUDIT_ACTION.WORK_TASK_MEDIA_LINK_REMOVE,
];

/** Event dates and session slices use warehouse civil midnight, including DST. */
export const pomodoroReportDbDeps: PomodoroReportDeps = {
  fetchActivity: async ({ orgId, from, to, staffId }) => {
    const result = await tenantQuery<ActivityRow>(orgId, `
      WITH activity AS (
        SELECT 'activity:' || e.id AS event_id, e.staff_id, e.assignment_id,
               e.daily_check_item_id, to_char(e.check_date, 'YYYY-MM-DD') AS check_date,
               to_char(e.event_day, 'YYYY-MM-DD') AS event_day,
               e.event_type, e.source, e.occurred_at, e.duration_ms
          FROM pomodoro_activity_events e
         WHERE e.organization_id = $1 AND e.event_day BETWEEN $2::date AND $3::date
           AND ($4::int IS NULL OR e.staff_id = $4)
        UNION ALL
        SELECT 'audit:' || a.id AS event_id, a.actor_staff_id AS staff_id,
               CASE WHEN a.entity_id ~ '^[0-9]{1,18}$' THEN a.entity_id::bigint ELSE NULL END AS assignment_id,
               NULL::bigint AS daily_check_item_id, NULL::text AS check_date,
               to_char(a.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS event_day,
               'worked'::text AS event_type, a.action AS source, a.created_at AS occurred_at,
               NULL::bigint AS duration_ms
          FROM audit_logs a
         WHERE a.organization_id = $1 AND a.entity_type = 'work_assignment'
           AND a.action = ANY($5::text[]) AND a.actor_staff_id IS NOT NULL
           AND a.entity_id ~ '^[0-9]{1,18}$'
           AND a.created_at >= ($2::date::timestamp AT TIME ZONE 'America/Los_Angeles')
           AND a.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
           AND ($4::int IS NULL OR a.actor_staff_id = $4)
      )
      SELECT activity.*, COALESCE(NULLIF(wa.project_name, ''), NULLIF(left(wa.notes, 200), '')) AS task_title,
             i.title AS checklist_title, wa.entity_type::text AS target_entity_type,
             wa.entity_id AS target_entity_id, wa.started_at AS lifecycle_started_at,
             st.name AS staff_name
        FROM activity
        LEFT JOIN work_assignments wa ON wa.organization_id = $1 AND wa.id = activity.assignment_id
        LEFT JOIN daily_check_items i ON i.organization_id = $1 AND i.id = activity.daily_check_item_id
        LEFT JOIN staff st ON st.organization_id = $1 AND st.id = activity.staff_id
       WHERE activity.assignment_id IS NOT NULL OR activity.daily_check_item_id IS NOT NULL
    `, [orgId, from, to, staffId ?? null, TASK_INTERACTIONS]);
    return result.rows.map((row) => ({
      ...row,
      title: row.assignment_id === null
        ? (row as ActivityRow & { checklist_title: string | null }).checklist_title
        : (row as ActivityRow & { task_title: string | null }).task_title,
    }));
  },
  fetchSessionDays: async ({ orgId, from, to, staffId }) => {
    const result = await tenantQuery<SessionDayRow>(orgId, `
      SELECT s.staff_id, st.name AS staff_name, s.assignment_id, s.daily_check_item_id,
             to_char(s.check_date, 'YYYY-MM-DD') AS check_date,
             to_char(d.day, 'YYYY-MM-DD') AS event_day,
             FLOOR(EXTRACT(EPOCH FROM (
               LEAST(COALESCE(s.ended_at, clock_timestamp()),
                 (d.day::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
               - GREATEST(s.started_at,
                 d.day::date::timestamp AT TIME ZONE 'America/Los_Angeles')
             )) * 1000)::bigint AS duration_ms,
             COALESCE(NULLIF(wa.project_name, ''), NULLIF(left(wa.notes, 200), ''), i.title) AS title,
             wa.entity_type::text AS target_entity_type, wa.entity_id AS target_entity_id
        FROM pomodoro_work_sessions s
        JOIN generate_series($2::date::timestamp, $3::date::timestamp, interval '1 day') AS d(day)
          ON s.started_at < ((d.day::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
         AND COALESCE(s.ended_at, clock_timestamp()) >
           (d.day::date::timestamp AT TIME ZONE 'America/Los_Angeles')
        LEFT JOIN work_assignments wa ON wa.organization_id = $1 AND wa.id = s.assignment_id
        LEFT JOIN daily_check_items i ON i.organization_id = $1 AND i.id = s.daily_check_item_id
        LEFT JOIN staff st ON st.organization_id = $1 AND st.id = s.staff_id
       WHERE s.organization_id = $1 AND ($4::int IS NULL OR s.staff_id = $4)
         AND s.started_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
         AND COALESCE(s.ended_at, clock_timestamp()) >
           ($2::date::timestamp AT TIME ZONE 'America/Los_Angeles')
    `, [orgId, from, to, staffId ?? null]);
    return result.rows;
  },
};
