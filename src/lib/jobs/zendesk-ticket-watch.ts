/**
 * Zendesk ticket-watch poller — the open Zendesk-bound Support items whose
 * primary task is still live are the watch list (task assignees own Support
 * work). Each visited ticket is fetched live, its full local mirror refreshed
 * (which feeds the local Support thread through the mirror bridge, so a new
 * customer comment reopens and alerts there), and the task's assignees are
 * told when the provider subject/status changed. The provider's "solved" is
 * mirror metadata only — it never resolves the local item or task.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { invalidateZendeskOverviewCache } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { createStaffMessage } from '@/lib/neon/staff-messages-queries';
import { publishStaffMessage } from '@/lib/realtime/publish';
import { remirrorFetchedTicket } from '@/lib/support/ticket-mirror';
import { syncZendeskTicketRegistryCaches } from '@/lib/support/tickets';
import { diffTicketWatchCaches } from '@/lib/jobs/zendesk-ticket-watch-diff';

export interface ZendeskTicketWatchResult {
  checked: number;
  changed: number;
  notified: number;
  skipped: number;
  errors: number;
}

interface ZendeskWatchTarget {
  ticketId: number;
  /** Staff who handed the task out — the notification's sender when known. */
  assignedBy: number | null;
  assigneeStaffIds: number[];
}

/** Open Zendesk-bound Support items with a live primary task, most recently active first. */
async function listZendeskWatchTargets(orgId: OrgId, limit: number): Promise<ZendeskWatchTarget[]> {
  const capped = Math.min(Math.max(Math.floor(limit), 1), 500);
  const r = await tenantQuery<{
    external_ticket_id: string;
    assigned_by_staff_id: number | null;
    assignee_ids: number[] | null;
  }>(
    orgId,
    `SELECT st.external_ticket_id,
            wa.assigned_by_staff_id,
            array_agg(waa.staff_id ORDER BY waa.staff_id)
              FILTER (WHERE waa.staff_id IS NOT NULL) AS assignee_ids
       FROM support_tickets st
       JOIN work_assignments wa
         ON wa.organization_id = st.organization_id
        AND wa.id = st.primary_task_id
       LEFT JOIN work_assignment_assignees waa
         ON waa.organization_id = wa.organization_id
        AND waa.assignment_id = wa.id
      WHERE st.organization_id = $1
        AND st.provider = 'zendesk'
        AND st.external_ticket_id ~ '^[0-9]{1,15}$'
        AND st.lifecycle <> 'resolved'
        AND wa.status NOT IN ('DONE', 'CANCELED')
      GROUP BY st.id, wa.id
      ORDER BY GREATEST(st.updated_at, wa.updated_at) DESC, st.id DESC
      LIMIT ${capped}`,
    [orgId],
  );
  return r.rows.map((row) => ({
    ticketId: Number(row.external_ticket_id),
    assignedBy: row.assigned_by_staff_id != null ? Number(row.assigned_by_staff_id) : null,
    assigneeStaffIds: (row.assignee_ids ?? []).map(Number),
  }));
}

/**
 * Poll watched tickets for ONE org. Cron fans this out via
 * `forEachOrgWithProvider('zendesk', …)`.
 */
export async function runZendeskTicketWatch(
  orgId: OrgId,
  opts: { limit?: number } = {},
): Promise<ZendeskTicketWatchResult> {
  const result: ZendeskTicketWatchResult = {
    checked: 0,
    changed: 0,
    notified: 0,
    skipped: 0,
    errors: 0,
  };

  const helpdesk = await getHelpdeskProvider(orgId);
  if (!helpdesk || !(await helpdesk.isConfigured())) {
    return result;
  }

  const watches = await listZendeskWatchTargets(orgId, opts.limit ?? 100);
  for (const watch of watches) {
    result.checked += 1;
    try {
      const ticket = await helpdesk.getTicket(watch.ticketId);
      if (!ticket) {
        result.skipped += 1;
        continue;
      }

      const next = {
        subject: ticket.subject?.trim() || null,
        status: ticket.status ? String(ticket.status) : null,
      };

      const synced = await syncZendeskTicketRegistryCaches({
        orgId,
        zendeskTicketId: watch.ticketId,
        subject: next.subject,
        status: next.status,
        staffId: watch.assignedBy,
      });

      // Full mirror (ticket + thread) for every visited ticket, changed or not —
      // reuses the ticket just fetched; never blocks the notify below.
      await remirrorFetchedTicket(orgId, helpdesk, ticket);

      const diff = diffTicketWatchCaches(synced.previous, next);
      if (!diff.changed) {
        result.skipped += 1;
        continue;
      }

      result.changed += 1;
      await invalidateZendeskOverviewCache(orgId);

      // First-time registry fill (null → values on first poll) is not a
      // "ticket updated" event — only notify when we had a prior cache.
      const hadBaseline = synced.previous.subject != null || synced.previous.status != null;
      if (!hadBaseline || watch.assigneeStaffIds.length === 0) {
        result.skipped += 1;
        continue;
      }

      const body = `Ticket #${watch.ticketId} updated — ${diff.summary}`;
      for (const recipientId of watch.assigneeStaffIds) {
        const message = await createStaffMessage({
          organizationId: orgId,
          senderId: watch.assignedBy ?? recipientId,
          recipientId,
          body,
          kind: 'support_assignment',
          context: {
            ticketId: watch.ticketId,
            subject: next.subject,
            change: diff.summary,
          },
        });
        await publishStaffMessage({
          organizationId: orgId,
          recipientId: message.recipientId,
          messageId: message.id,
          senderId: message.senderId,
          senderName: message.senderName,
          body: message.body,
          kind: message.kind,
          context: message.context,
        });
        result.notified += 1;
      }
    } catch (err) {
      result.errors += 1;
      console.warn(
        '[zendesk.ticket-watch] failed for ticket',
        watch.ticketId,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}
