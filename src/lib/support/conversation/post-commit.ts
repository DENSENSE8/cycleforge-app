import 'server-only';

/**
 * The Support loop's after-commit effects — never inside the write
 * transaction, never blocking a response (routes run them in `after()`):
 * task-owner alerts (`sendTaskAlert`, the same inbox rows + Timeline audit row
 * + live push as Tasks → Alert), the create-task assignment notices, and the
 * draft worker kick.
 */
import pool from '@/lib/db';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { logger } from '@/lib/observability/logger';
import { processPendingSupportDrafts } from '@/lib/support/drafts/process';
import { createTaskDeps } from '@/lib/tasks/create-task-deps';
import { sendTaskAlert } from '@/lib/tasks/task-alerts';
import { publishTaskAlerts, taskAlertDeps } from '@/lib/tasks/task-alerts-db';
import type { OrgId } from '@/lib/tenancy/constants';

import type { SupportPostCommit } from './ingest-core';

/**
 * Alert a task's owners (minus the actor) once per `alertKey`. Returns the
 * staff who got a NEW inbox row (empty on a replayed key).
 */
export async function sendSupportTaskAlert(
  orgId: OrgId,
  args: { taskId: number; alertKey: string; note: string; dueAt?: string | null; actorStaffId: number | null },
): Promise<number[]> {
  const result = await sendTaskAlert(
    {
      taskId: args.taskId,
      actorStaffId: args.actorStaffId,
      alertKey: args.alertKey,
      body: { note: args.note, dueAt: args.dueAt ?? null },
    },
    taskAlertDeps(orgId),
  );
  if (!result.ok || result.deliveries.length === 0) return [];
  await recordAudit(pool, null, null, {
    source: 'support-loop',
    action: AUDIT_ACTION.TASK_FOLLOW_UP_ALERT,
    entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
    entityId: args.taskId,
    actorStaffIdOverride: args.actorStaffId,
    organizationIdOverride: orgId,
    method: 'system',
    after: { staffIds: result.staffIds, note: result.note, dueAt: result.dueAt, alertKey: args.alertKey },
  });
  await publishTaskAlerts(orgId, {
    taskId: args.taskId,
    actorStaffId: args.actorStaffId,
    note: result.note,
    deliveries: result.deliveries,
  });
  return result.deliveries.map((d) => d.staffId);
}

/** The production {@link SupportPostCommit}. Each effect logs its own failure; none throws. */
export const supportPostCommit: SupportPostCommit = {
  async alert(orgId, a) {
    try {
      await sendSupportTaskAlert(orgId, a);
    } catch (error) {
      logger.warn({ taskId: a.taskId, alertKey: a.alertKey, error: String(error) }, 'support alert failed');
    }
  },

  async notifyNewTask(orgId, t) {
    const deps = createTaskDeps(orgId);
    const task = {
      id: t.taskId,
      entityType: 'support_ticket' as const,
      entityId: t.supportItemId,
      assigneeStaffId: t.assigneeStaffIds[0],
      assigneeStaffIds: t.assigneeStaffIds,
      projectName: null,
      priority: t.priority,
      note: t.note,
    };
    // Exactly what createTaskCore does after its insert: one assignment row per
    // recipient but the thrower, then the urgency promotion on the record.
    for (const recipientStaffId of t.assigneeStaffIds.filter((id) => id !== t.actorStaffId)) {
      try {
        await deps.notifyAssignee({ task, recipientStaffId, actorStaffId: t.actorStaffId, urgent: t.urgent });
      } catch (error) {
        logger.warn({ taskId: t.taskId, recipientStaffId, error: String(error) }, 'support task assignment notice failed');
      }
    }
    if (t.urgent) {
      await deps.promoteUrgency('support_ticket', t.supportItemId).catch((error: unknown) =>
        logger.warn({ taskId: t.taskId, error: String(error) }, 'support urgency promotion failed'),
      );
    }
  },

  async processDrafts(orgId, supportItemId) {
    try {
      await processPendingSupportDrafts(orgId, { supportItemId });
    } catch (error) {
      logger.warn({ supportItemId, error: String(error) }, 'support draft worker failed');
    }
  },
};
