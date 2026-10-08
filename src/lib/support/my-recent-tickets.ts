/**
 * "My recent tickets" — the helpdesk tickets the signed-in staffer worked on
 * most recently, newest first.
 *
 * Source of truth: `helpdesk_comment_staff`. Every reply, internal note and
 * ticket opening posted from this app binds its Zendesk comment to the posting
 * staffer with a `created_at` stamp (`recordHelpdeskCommentStaff` /
 * `recordStaffForPostedComment` in src/lib/integrations/helpdesk/comment-staff.ts).
 * Zendesk's own `commenter:me` cannot answer this: every API post is authored by
 * the shared integration user. Subject and status come from the local ticket
 * registry (`support_tickets`, kept current by the ticket mirror).
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const MY_RECENT_TICKETS_DEFAULT_LIMIT = 25;
export const MY_RECENT_TICKETS_MAX_LIMIT = 50;

export interface MyRecentTicket {
  /** Zendesk ticket id. */
  id: number;
  subject: string | null;
  status: string | null;
  /** When this staffer last posted on the ticket, ISO. */
  lastWorkedAt: string;
}

export interface MyRecentTicketRow {
  ticket_id: string | number;
  last_worked_at: string | Date;
  subject: string | null;
  status: string | null;
}

export const MY_RECENT_TICKETS_SQL = `WITH mine AS (
  SELECT zendesk_ticket_id, MAX(created_at) AS last_worked_at
    FROM helpdesk_comment_staff
   WHERE organization_id = $1 AND staff_id = $2
   GROUP BY zendesk_ticket_id
   ORDER BY last_worked_at DESC
   LIMIT $3
)
SELECT m.zendesk_ticket_id AS ticket_id, m.last_worked_at,
       st.subject_cache AS subject, st.status_cache AS status
  FROM mine m
  LEFT JOIN support_tickets st
    ON st.organization_id = $1
   AND st.provider = 'zendesk'
   AND st.external_ticket_id = m.zendesk_ticket_id::text
 ORDER BY m.last_worked_at DESC`;

export interface MyRecentTicketsDeps {
  query: (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: MyRecentTicketRow[] }>;
}

const defaultDeps: MyRecentTicketsDeps = {
  query: (orgId, text, params) => tenantQuery<MyRecentTicketRow>(orgId, text, params),
};

export async function listMyRecentTickets(
  args: { orgId: OrgId; staffId: number; limit?: number },
  deps: MyRecentTicketsDeps = defaultDeps,
): Promise<MyRecentTicket[]> {
  const limit = Math.min(
    MY_RECENT_TICKETS_MAX_LIMIT,
    Math.max(1, Math.trunc(args.limit ?? MY_RECENT_TICKETS_DEFAULT_LIMIT)),
  );
  const { rows } = await deps.query(args.orgId, MY_RECENT_TICKETS_SQL, [args.orgId, args.staffId, limit]);
  return rows.map((r) => ({
    id: Number(r.ticket_id),
    subject: r.subject?.trim() || null,
    status: r.status?.trim() || null,
    lastWorkedAt: new Date(r.last_worked_at).toISOString(),
  }));
}
