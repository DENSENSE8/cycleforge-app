/**
 * Zendesk ticket-watch poller — pull live ticket state for in-app watches
 * (`support_ticket_assignments`) and notify assignees when subject/status change.
 *
 * Same house pattern as carrier `sync-due`: poll the provider API on a cron
 * instead of inbound Zendesk webhooks (explicitly deferred in
 * `warranty/zendesk-link.ts`).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { invalidateZendeskTicketCache } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { createStaffMessage } from '@/lib/neon/staff-messages-queries';
import { publishStaffMessage } from '@/lib/realtime/publish';
import { syncZendeskTicketRegistryCaches } from '@/lib/support/tickets';
import { listTicketAssignmentsForOrg } from '@/lib/zendesk-assignments';
import { diffTicketWatchCaches } from '@/lib/jobs/zendesk-ticket-watch-diff';

export interface ZendeskTicketWatchResult {
  checked: number;
  changed: number;
  notified: number;
  skipped: number;
  errors: number;
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

  const watches = await listTicketAssignmentsForOrg(orgId, { limit: opts.limit ?? 100 });
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

      const diff = diffTicketWatchCaches(synced.previous, next);
      if (!diff.changed) {
        result.skipped += 1;
        continue;
      }

      result.changed += 1;
      await invalidateZendeskTicketCache(orgId, watch.ticketId);

      // First-time registry fill (null → values on first poll) is not a
      // "ticket updated" event — only notify when we had a prior cache.
      const hadBaseline = synced.previous.subject != null || synced.previous.status != null;
      if (!hadBaseline) {
        result.skipped += 1;
        continue;
      }

      const body = `Ticket #${watch.ticketId} updated — ${diff.summary}`;
      const senderId = watch.assignedBy ?? watch.assignedStaffId;
      const message = await createStaffMessage({
        organizationId: orgId,
        senderId,
        recipientId: watch.assignedStaffId,
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
