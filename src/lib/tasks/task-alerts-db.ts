import 'server-only';

/** Real tenant bindings for task follow-up alerts (`staff_inbox_items`). */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { TASK_ALERT_INBOX_ITEM_SQL, taskAlertInboxItemParams } from '@/lib/notifications/assign-inbox-item';
import { WORK_TASK_FOLLOW_UP_ALERT } from '@/lib/notifications/event-vocabulary';
import { publishInboxItem } from '@/lib/realtime/publish';
import { scrubRelayAddresses } from '@/lib/support/contact-face';

import { taskAlertContacts, type TaskAlertDelivery, type TaskAlertDeps, type TaskAlertTask } from './task-alerts';
import { taskDeskTitle } from './task-desk-row';
import { listTaskEmailRefs } from './task-email-refs-db';
import { listTaskLinks } from './task-links-db';
import { TASK_WORK_TYPE, taskEntityEnum, taskEntityFromEnum } from './task-vocabulary';
import { SUPPORT_CHANNEL_LABEL, type SupportChannel } from '@/lib/support/conversation/model';

export function taskAlertDeps(orgId: OrgId): TaskAlertDeps {
  return {
    async readTask(taskId): Promise<TaskAlertTask | null> {
      const res = await tenantQuery<{
        id: number | string;
        entity_type: string | null;
        entity_id: number | string | null;
        notes: string | null;
        ticket_external_id: string | null;
        owner_ids: Array<number | string> | null;
        support_item_id: number | string | null;
        support_provider: string | null;
        support_subject: string | null;
        support_requester_email: string | null;
        support_account_label: string | null;
        support_orders: Array<{ orderId: number | string; orderNumber: string | null }> | null;
      }>(
        orgId,
        // The Support item's facts read through to_jsonb so the query also runs
        // before 2026-10-04d adds requester_email / account_label / primary_order_id.
        `SELECT wa.id, wa.entity_type::text AS entity_type, wa.entity_id, wa.notes,
                st.external_ticket_id AS ticket_external_id,
                ARRAY(
                  SELECT o.staff_id FROM (
                    SELECT wa.assignee_staff_id AS staff_id, 0 AS rank WHERE wa.assignee_staff_id IS NOT NULL
                    UNION
                    SELECT a.staff_id, 1 FROM work_assignment_assignees a
                     WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
                  ) o
                  GROUP BY o.staff_id
                  ORDER BY MIN(o.rank), o.staff_id
                ) AS owner_ids,
                st.id AS support_item_id,
                st.provider AS support_provider,
                st.subject_cache AS support_subject,
                to_jsonb(st) ->> 'requester_email' AS support_requester_email,
                to_jsonb(st) ->> 'account_label' AS support_account_label,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('orderId', o.id, 'orderNumber', o.order_id)
                                           ORDER BY (o.id::text = to_jsonb(st) ->> 'primary_order_id') DESC,
                                                    tl.is_primary DESC, tl.id), '[]'::jsonb)
                   FROM ticket_links tl
                   JOIN orders o ON o.organization_id = tl.organization_id AND o.id = tl.entity_id
                  WHERE st.id IS NOT NULL
                    AND tl.organization_id = st.organization_id
                    AND tl.support_ticket_id = st.id
                    AND tl.entity_type = 'ORDER') AS support_orders
           FROM work_assignments wa
           LEFT JOIN support_tickets st
             ON wa.entity_type::text = $4
            AND st.id = wa.entity_id
            AND st.organization_id = wa.organization_id
          WHERE wa.organization_id = $1::uuid AND wa.id = $2 AND wa.work_type::text = $3
          LIMIT 1`,
        [orgId, taskId, TASK_WORK_TYPE, taskEntityEnum('support_ticket')],
      );
      const row = res.rows[0];
      if (!row) return null;
      const entityType = row.entity_type == null ? null : taskEntityFromEnum(row.entity_type);
      // The contacts ride on the row as they are NOW — a snapshot, never re-read by the recipient.
      const [links, emailRefs] = await Promise.all([listTaskLinks(orgId, taskId), listTaskEmailRefs(orgId, taskId)]);
      const ticketNumber = Number(row.ticket_external_id?.trim());
      const supportProvider = row.support_provider as SupportChannel | null;
      return {
        id: Number(row.id),
        // The board's row face: instructions first, the project is its own pill
        // (`taskBoardRowFromTask`) — so the alert names the row the staffer sees.
        title:
          row.support_item_id == null
            ? taskDeskTitle({
                entityType,
                entityId: entityType == null || row.entity_id == null ? null : Number(row.entity_id),
                note: row.notes,
                projectName: null,
              })
            : // A Support task is named by its instructions, else the item's subject — never "Ticket <local id>".
              (row.notes?.trim() ? taskDeskTitle({ entityType: null, entityId: null, note: row.notes, projectName: null }) : null) ??
              scrubRelayAddresses(row.support_subject?.trim() || `Support #${Number(row.support_item_id)}`),
        ownerIds: (row.owner_ids ?? []).map(Number),
        contacts: taskAlertContacts({
          anchorTicketNumber: Number.isInteger(ticketNumber) && ticketNumber > 0 ? ticketNumber : null,
          links: links ?? [],
          emailRefs: emailRefs?.refs ?? [],
          supportItem:
            row.support_item_id == null
              ? null
              : {
                  id: Number(row.support_item_id),
                  requesterEmail: row.support_requester_email?.trim() || null,
                  mailbox:
                    row.support_account_label?.trim() ||
                    (supportProvider && supportProvider in SUPPORT_CHANNEL_LABEL ? SUPPORT_CHANNEL_LABEL[supportProvider] : 'Support'),
                  orders: (row.support_orders ?? []).flatMap((o) =>
                    o.orderNumber?.trim() ? [{ orderId: Number(o.orderId), orderNumber: o.orderNumber.trim() }] : [],
                  ),
                },
        }),
      };
    },

    async staffInOrg(staffIds) {
      const res = await tenantQuery<{ id: number | string }>(
        orgId,
        `SELECT id FROM staff WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
        [orgId, staffIds],
      );
      return res.rows.map((r) => Number(r.id));
    },

    async insertInboxItems({ task, staffIds, alertKey, actorStaffId, note, dueAt }) {
      return withTenantTransaction(orgId, async (client) => {
        const deliveries: TaskAlertDelivery[] = [];
        for (const staffId of staffIds) {
          const inserted = await client.query<{ id: number | string }>(
            TASK_ALERT_INBOX_ITEM_SQL,
            taskAlertInboxItemParams(orgId, {
              staffId,
              taskId: task.id,
              alertKey,
              actorStaffId,
              title: task.title,
              note,
              dueAt,
              contacts: task.contacts,
            }),
          );
          const itemId = inserted.rows[0]?.id;
          if (itemId != null) deliveries.push({ staffId, itemId: Number(itemId) });
        }
        return deliveries;
      });
    },
  };
}

/** The live push for each durable row — after the response, never blocking it. */
export async function publishTaskAlerts(
  orgId: OrgId,
  args: { taskId: number; actorStaffId: number | null; note: string | null; deliveries: TaskAlertDelivery[] },
): Promise<void> {
  // The toast names the sender ("Michael asked you to follow up").
  const actorName =
    args.actorStaffId == null
      ? null
      : ((
          await tenantQuery<{ name: string | null }>(
            orgId,
            `SELECT name FROM staff WHERE organization_id = $1::uuid AND id = $2`,
            [orgId, args.actorStaffId],
          )
        ).rows[0]?.name ?? null);
  await Promise.all(
    args.deliveries.map((d) =>
      publishInboxItem({
        organizationId: orgId,
        recipientId: d.staffId,
        itemId: d.itemId,
        entityType: 'task',
        entityId: args.taskId,
        eventKey: WORK_TASK_FOLLOW_UP_ALERT,
        actorStaffId: args.actorStaffId,
        actorName,
        note: args.note,
      }),
    ),
  );
}
