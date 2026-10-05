/**
 * Support follow-up inbox — open Support items whose PRIMARY TASK the staffer
 * is an assignee of (task assignees are the one ownership source; the
 * deprecated support_ticket_assignments table is never read). Backs
 * GET /api/inbox/support for the notifications bell, the My Day interrupts
 * and the assistant's list_support_followups.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type SupportFollowupInboxRow = {
  supportItemId: number;
  /** work_assignments.id — the Tasks → Support record to open. */
  taskId: number;
  /** The number an operator reads: the Zendesk ticket number when bound, else the local item number. */
  ticketId: number;
  subject: string | null;
  assignedStaffId: number;
  assignedStaffName: string;
  assignedByStaffId: number | null;
  assignedByStaffName: string | null;
  updatedAtMs: number;
};

/** Open Support items whose primary task `staffId` owns, newest activity first. */
export async function listSupportFollowupsForStaff(
  organizationId: OrgId,
  staffId: number,
): Promise<SupportFollowupInboxRow[]> {
  const r = await tenantQuery<{
    support_item_id: string;
    task_id: number;
    ticket_number: string;
    subject: string | null;
    assigned_staff_id: number;
    assigned_staff_name: string | null;
    assigned_by_staff_id: number | null;
    assigned_by_staff_name: string | null;
    updated_at_ms: string;
  }>(
    organizationId,
    `SELECT st.id AS support_item_id,
            wa.id AS task_id,
            CASE WHEN st.provider = 'zendesk' AND st.external_ticket_id ~ '^[0-9]{1,15}$'
                 THEN st.external_ticket_id
                 ELSE st.id::text END AS ticket_number,
            st.subject_cache AS subject,
            waa.staff_id::int AS assigned_staff_id,
            assignee.name AS assigned_staff_name,
            wa.assigned_by_staff_id::int AS assigned_by_staff_id,
            assigner.name AS assigned_by_staff_name,
            (EXTRACT(EPOCH FROM GREATEST(wa.updated_at, st.updated_at)) * 1000)::bigint AS updated_at_ms
       FROM support_tickets st
       JOIN work_assignments wa
         ON wa.organization_id = st.organization_id
        AND wa.id = st.primary_task_id
       JOIN work_assignment_assignees waa
         ON waa.organization_id = wa.organization_id
        AND waa.assignment_id = wa.id
        AND waa.staff_id = $2
       JOIN staff assignee ON assignee.id = waa.staff_id
       LEFT JOIN staff assigner ON assigner.id = wa.assigned_by_staff_id
      WHERE st.organization_id = $1
        AND st.lifecycle <> 'resolved'
        AND wa.status NOT IN ('DONE', 'CANCELED')
      ORDER BY GREATEST(wa.updated_at, st.updated_at) DESC, st.id DESC
      LIMIT 50`,
    [organizationId, staffId],
  );

  return r.rows.map((row) => ({
    supportItemId: Number(row.support_item_id),
    taskId: Number(row.task_id),
    ticketId: Number(row.ticket_number),
    subject: row.subject,
    assignedStaffId: Number(row.assigned_staff_id),
    assignedStaffName: String(row.assigned_staff_name ?? `Staff #${row.assigned_staff_id}`),
    assignedByStaffId: row.assigned_by_staff_id != null ? Number(row.assigned_by_staff_id) : null,
    assignedByStaffName:
      row.assigned_by_staff_name != null ? String(row.assigned_by_staff_name) : null,
    updatedAtMs: Number(row.updated_at_ms) || 0,
  }));
}
