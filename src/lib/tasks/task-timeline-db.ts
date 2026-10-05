import 'server-only';

/** Real tenant read for a task's Timeline: its audit rows (created / edits / alerts) and the staff names they mention. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { findTaskAnchor } from './task-links-db';
import { SUPPORT_TIMELINE_ACTIONS } from '@/lib/support/conversation/timeline-events';
import {
  taskAlertEntryFromRow,
  taskAuditEntryFromRow,
  type TaskAlertEntry,
  type TaskAuditEntry,
  type TaskTimelinePayload,
} from './task-timeline';

interface AuditRow {
  id: string;
  created_at: Date;
  actor_staff_id: number | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

/** The audit half of one task's timeline; null when the id is not a task in this org. */
export async function readTaskTimelineAudit(
  orgId: OrgId,
  taskId: number,
): Promise<Omit<TaskTimelinePayload, 'ok'> | null> {
  if (!(await findTaskAnchor(orgId, taskId))) return null;
  const res = await tenantQuery<AuditRow>(
    orgId,
    `SELECT id, created_at, actor_staff_id, action, before_data, after_data, metadata
       FROM audit_logs
      WHERE organization_id = $1::uuid
        AND entity_type = $2
        AND entity_id = $3
        AND action = ANY($4::text[])
      ORDER BY created_at DESC, id DESC
      LIMIT 500`,
    [
      orgId,
      AUDIT_ENTITY.WORK_ASSIGNMENT,
      String(taskId),
      [
        AUDIT_ACTION.WORK_TASK_THROW,
        AUDIT_ACTION.WORK_TASK_UPDATE,
        AUDIT_ACTION.TASK_FOLLOW_UP_ALERT,
        // The Support loop's own events on the item's primary task.
        ...SUPPORT_TIMELINE_ACTIONS,
      ],
    ],
  );

  const audit: TaskAuditEntry[] = [];
  const alerts: TaskAlertEntry[] = [];
  const staffIds = new Set<number>();
  for (const row of res.rows) {
    if (row.action === AUDIT_ACTION.TASK_FOLLOW_UP_ALERT) {
      const alert = taskAlertEntryFromRow(row);
      if (!alert) continue;
      alerts.push(alert);
      alert.staffIds.forEach((id) => staffIds.add(id));
      if (alert.actorStaffId != null) staffIds.add(alert.actorStaffId);
      continue;
    }
    const entry = taskAuditEntryFromRow(row);
    if (!entry) continue;
    audit.push(entry);
    if (entry.actorStaffId != null) staffIds.add(entry.actorStaffId);
    entry.assigneesBefore?.forEach((id) => staffIds.add(id));
    entry.assigneesAfter?.forEach((id) => staffIds.add(id));
  }

  const staffNames: Record<number, string> = {};
  if (staffIds.size > 0) {
    const names = await tenantQuery<{ id: number; name: string | null }>(
      orgId,
      `SELECT id, name FROM staff WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
      [orgId, [...staffIds]],
    );
    for (const row of names.rows) if (row.name) staffNames[row.id] = row.name;
  }
  return { audit, alerts, staffNames };
}
