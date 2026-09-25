import 'server-only';

/**
 * Real tenant bindings for {@link listStaffReminders}. Each query only
 * NARROWS (staffer, window, days) and maps; every rule that decides whether a
 * reminder rings lives in the pure core. Org-scoped twice: the GUC wrapper and
 * an explicit `organization_id` filter.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import { dailyCheckItemLiveOnSql, dailyCheckItemOwedBySql } from '@/lib/daily-checks/queries';
import { TASK_WORK_TYPE, taskEntityEnum, taskEntityFromEnum } from '@/lib/tasks/task-vocabulary';

import type {
  ChecklistReminderCandidate,
  StaffReminderDeps,
  TaskReminderCandidate,
} from './list-staff-reminders';

/**
 * A task rings at `remind_at`, or at `deadline_at` when it has no reminder —
 * the same either/or the core applies. Status is NOT filtered here; the core
 * owns "still open".
 */
const TASK_CANDIDATES_SQL = `
  SELECT wa.id,
         wa.entity_type::text  AS entity_type,
         wa.entity_id,
         wa.notes,
         wa.project_name,
         wa.status::text       AS status,
         wa.priority,
         wa.remind_at,
         wa.deadline_at,
         sb.name               AS assigned_by_name,
         st.id                 AS ticket_id,
         st.provider           AS ticket_provider,
         st.subject_cache      AS ticket_subject,
         st.status_cache       AS ticket_status,
         st.external_ticket_id AS ticket_external_id
    FROM work_assignments wa
    LEFT JOIN staff sb
      ON sb.id = wa.assigned_by_staff_id
     AND sb.organization_id = wa.organization_id
    LEFT JOIN support_tickets st
      ON wa.entity_type::text = $6
     AND st.id = wa.entity_id
     AND st.organization_id = wa.organization_id
   WHERE wa.organization_id = $1::uuid
     AND wa.work_type::text = $2
     AND EXISTS (
           SELECT 1 FROM work_assignment_assignees a
            WHERE a.organization_id = wa.organization_id
              AND a.assignment_id = wa.id
              AND a.staff_id = $3
         )
     AND (
           (wa.remind_at >= $4::timestamptz AND wa.remind_at < $5::timestamptz)
        OR (wa.remind_at IS NULL AND wa.deadline_at >= $4::timestamptz AND wa.deadline_at < $5::timestamptz)
         )`;

/** One row per live, owed, reminder-bearing item per requested civil day. */
const CHECKLIST_CANDIDATES_SQL = `
  SELECT i.id,
         to_char(d.day, 'YYYY-MM-DD')      AS day_key,
         i.title,
         to_char(i.due_time, 'HH24:MI')    AS due_time,
         i.remind_offset_minutes
    FROM unnest($3::date[]) AS d(day)
    JOIN daily_check_items i
      ON i.organization_id = $1::uuid
     AND ${dailyCheckItemLiveOnSql('i', 'd.day')}
   WHERE i.due_time IS NOT NULL
     AND i.remind_offset_minutes IS NOT NULL
     AND ${dailyCheckItemOwedBySql('i', '$2')}`;

const CHECKLIST_MARKS_SQL = `
  SELECT item_id, to_char(marked_on, 'YYYY-MM-DD') AS day_key
    FROM daily_check_marks
   WHERE organization_id = $1::uuid
     AND staff_id = $2
     AND marked_on = ANY($3::date[])`;

function iso(value: unknown): string | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const staffReminderDbDeps: StaffReminderDeps = {
  async listTaskCandidates(orgId, staffId, fromIso, toIso) {
    const { rows } = await tenantQuery<Record<string, unknown>>(orgId, TASK_CANDIDATES_SQL, [
      orgId,
      TASK_WORK_TYPE,
      staffId,
      fromIso,
      toIso,
      taskEntityEnum('support_ticket'),
    ]);
    const out: TaskReminderCandidate[] = [];
    for (const r of rows) {
      const entityType = taskEntityFromEnum(r.entity_type);
      if (!entityType) continue;
      out.push({
        id: Number(r.id),
        entityType,
        // BIGINT arrives as a string from node-postgres.
        entityId: Number(r.entity_id),
        note: r.notes == null ? null : String(r.notes),
        projectName: r.project_name == null ? null : String(r.project_name),
        status: String(r.status),
        priority: Number(r.priority),
        remindAt: iso(r.remind_at),
        deadlineAt: iso(r.deadline_at),
        assignedByName: r.assigned_by_name == null ? null : String(r.assigned_by_name),
        ticket:
          r.ticket_id == null
            ? null
            : {
                id: Number(r.ticket_id),
                provider: String(r.ticket_provider ?? ''),
                subject: r.ticket_subject == null ? null : String(r.ticket_subject),
                status: r.ticket_status == null ? null : String(r.ticket_status),
                externalId: r.ticket_external_id == null ? null : String(r.ticket_external_id),
              },
      });
    }
    return out;
  },

  async listChecklistCandidates(orgId, staffId, dayKeys) {
    const { rows } = await tenantQuery<{
      id: string | number;
      day_key: string;
      title: string;
      due_time: string;
      remind_offset_minutes: number;
    }>(orgId, CHECKLIST_CANDIDATES_SQL, [orgId, staffId, dayKeys]);
    return rows.map(
      (r): ChecklistReminderCandidate => ({
        itemId: Number(r.id),
        dayKey: r.day_key,
        title: r.title,
        dueTime: r.due_time,
        remindOffsetMinutes: r.remind_offset_minutes,
      }),
    );
  },

  async listChecklistMarks(orgId, staffId, dayKeys) {
    const { rows } = await tenantQuery<{ item_id: string | number; day_key: string }>(
      orgId,
      CHECKLIST_MARKS_SQL,
      [orgId, staffId, dayKeys],
    );
    return rows.map((r) => ({ itemId: Number(r.item_id), dayKey: r.day_key }));
  },
};
