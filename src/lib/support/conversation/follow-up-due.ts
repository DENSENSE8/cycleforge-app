import 'server-only';

/** The Support follow-up-due sweep bound to Postgres and task alerts (rules: ./follow-up-due-core). */
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { TASK_WORK_TYPE, taskEntityEnum } from '@/lib/tasks/task-vocabulary';

import { runSupportFollowUpDueSweepCore, type SupportFollowUpDueDeps } from './follow-up-due-core';
import { sendSupportTaskAlert } from './post-commit';

export const supportFollowUpDueDeps: SupportFollowUpDueDeps = {
  async wakeSnoozed(orgId, nowMs) {
    const res = await tenantQuery(
      orgId,
      `UPDATE support_tickets
          SET lifecycle = 'open', snoozed_until = NULL, lifecycle_changed_at = now(), updated_at = now()
        WHERE organization_id = $1::uuid AND lifecycle = 'snoozed'
          AND snoozed_until IS NOT NULL AND snoozed_until <= $2::timestamptz`,
      [orgId, new Date(nowMs).toISOString()],
    );
    return res.rowCount ?? 0;
  },

  async listDue(orgId, nowMs) {
    const res = await tenantQuery<{
      task_id: number | string;
      item_id: number | string;
      next_follow_up_at: Date | string;
      subject_cache: string | null;
      requester_name: string | null;
      requester_email: string | null;
      requester_handle: string | null;
    }>(
      orgId,
      `SELECT wa.id AS task_id, st.id AS item_id, wa.next_follow_up_at, st.subject_cache,
              st.requester_name, st.requester_email, st.requester_handle
         FROM support_tickets st
         JOIN work_assignments wa ON wa.organization_id = st.organization_id AND wa.id = st.primary_task_id
        WHERE st.organization_id = $1::uuid
          AND wa.entity_type::text = $3 AND wa.work_type::text = $4
          AND wa.status::text IN ('OPEN','ASSIGNED','IN_PROGRESS')
          AND wa.next_follow_up_at IS NOT NULL AND wa.next_follow_up_at <= $2::timestamptz
          AND st.lifecycle <> 'resolved'
          AND NOT (st.lifecycle = 'snoozed' AND st.snoozed_until > $2::timestamptz)
        ORDER BY wa.next_follow_up_at, wa.id
        LIMIT 500`,
      [orgId, new Date(nowMs).toISOString(), taskEntityEnum('support_ticket'), TASK_WORK_TYPE],
    );
    return res.rows.map((r) => ({
      taskId: Number(r.task_id),
      supportItemId: Number(r.item_id),
      nextFollowUpAt: new Date(r.next_follow_up_at).toISOString(),
      subject: r.subject_cache,
      requester: { name: r.requester_name, email: r.requester_email, handle: r.requester_handle },
    }));
  },

  alert: (orgId, args) => sendSupportTaskAlert(orgId, args),
};

/** Alert owners of every due Support follow-up once per due instant (cron: /api/cron/support/loop). */
export function runSupportFollowUpDueSweep(orgId: OrgId, nowMs: number): Promise<{ alerted: number; tasks: number[] }> {
  return runSupportFollowUpDueSweepCore(orgId, nowMs, supportFollowUpDueDeps);
}
