/** Post one bench-log entry to its repair's Zendesk ticket as a note — after the entry has committed (`POST /api/repair/actions` schedules… */
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { recordStaffForPostedComment } from '@/lib/integrations/helpdesk/comment-staff';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { loadRepairAction } from '@/lib/repair/repair-action-queries';
import {
  REPAIR_LOG_TICKET_NOTE_PUBLIC,
  repairActionTicketNote,
  TICKET_POST_STALE_MS,
  ticketPostEligibility,
} from '@/lib/repair/repair-action-ticket-note';
import { readRepairTicketLink } from '@/lib/repair/ticket-link';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

type TicketPostOutcome =
  | { status: 'posted'; ticketId: number; commentId: number | null }
  | { status: 'failed'; ticketId: number | null; error: string }
  | { status: 'skipped'; reason: 'not-found' | 'not-linked' | 'posted' | 'in-flight' };

async function markFailed(orgId: OrgId, actionId: number, error: string): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE repair_actions SET ticket_post_status = 'failed', ticket_post_error = $3
      WHERE id = $1 AND organization_id = $2 AND ticket_post_status IS DISTINCT FROM 'posted'`,
    [actionId, orgId, error.slice(0, 500)],
  );
}

export async function postRepairActionToTicket(orgId: OrgId, actionId: number): Promise<TicketPostOutcome> {
  const action = await loadRepairAction(orgId, actionId);
  if (!action) return { status: 'skipped', reason: 'not-found' };

  const link = await readRepairTicketLink(orgId, action.repair_id);
  const eligible = ticketPostEligibility(link, action, Date.now());
  if (!eligible.ok) {
    // Queued while linked, unlinked since: say so on the row instead of "Posting…" forever.
    if (eligible.reason === 'not-linked' && action.ticket_post_status === 'pending') {
      const error = 'This repair is no longer linked to a helpdesk ticket.';
      await markFailed(orgId, actionId, error);
      return { status: 'failed', ticketId: null, error };
    }
    return { status: 'skipped', reason: eligible.reason };
  }
  const { ticketId } = eligible;

  const claimed = await tenantQuery(
    orgId,
    `UPDATE repair_actions
        SET ticket_post_status = 'pending', ticket_post_ticket_id = $3,
            ticket_post_error = NULL, ticket_post_attempted_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        AND ticket_comment_id IS NULL
        AND (ticket_post_status IS NULL
             OR ticket_post_status = 'failed'
             OR (ticket_post_status = 'pending'
                 AND (ticket_post_attempted_at IS NULL
                      OR ticket_post_attempted_at < NOW() - make_interval(secs => $4))))
      RETURNING id`,
    [actionId, orgId, ticketId, TICKET_POST_STALE_MS / 1000],
  );
  if (claimed.rowCount === 0) return { status: 'skipped', reason: 'in-flight' };

  const body = repairActionTicketNote(action);
  try {
    const helpdesk = await getHelpdeskProvider(orgId);
    if (!helpdesk || !(await helpdesk.isConfigured())) throw new Error('The helpdesk is not connected.');
    const ticket = await helpdesk.addComment(ticketId, { body, public: REPAIR_LOG_TICKET_NOTE_PUBLIC });
    if (!ticket) throw new Error(`Ticket #${ticketId} no longer exists.`);

    // The note is in; finding its id (and stamping the tech on it) is best-effort.
    let commentId: number | null = null;
    try {
      commentId = await recordStaffForPostedComment({
        orgId,
        ticketId,
        staffId: action.staff_id ?? 0,
        body,
        helpdesk,
      });
    } catch (err) {
      console.warn('[repair-action-ticket-post] comment id lookup failed', err);
    }
    await tenantQuery(
      orgId,
      `UPDATE repair_actions
          SET ticket_post_status = 'posted', ticket_comment_id = $3, ticket_post_error = NULL
        WHERE id = $1 AND organization_id = $2`,
      [actionId, orgId, commentId],
    );
    await publishRepairChanged({ organizationId: orgId, repairIds: [action.repair_id], source: 'repair.action-ticket-posted' });
    return { status: 'posted', ticketId, commentId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await markFailed(orgId, actionId, error);
    await publishRepairChanged({ organizationId: orgId, repairIds: [action.repair_id], source: 'repair.action-ticket-post-failed' });
    return { status: 'failed', ticketId, error };
  }
}
