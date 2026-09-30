/** Cycle Forge staff identity on helpdesk comments. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { HelpdeskProvider } from './types';

export async function recordHelpdeskCommentStaff(args: {
  orgId: OrgId;
  ticketId: number;
  commentId: number;
  staffId: number;
}): Promise<void> {
  if (!args.staffId || args.commentId <= 0) return;
  await tenantQuery(
    args.orgId,
    `INSERT INTO helpdesk_comment_staff
       (organization_id, zendesk_ticket_id, zendesk_comment_id, staff_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, zendesk_comment_id)
     DO UPDATE SET staff_id = EXCLUDED.staff_id`,
    [args.orgId, args.ticketId, args.commentId, args.staffId],
  );
}

/**
 * After a post, bind the newest matching comment to the posting staffer.
 * Returns that comment's id (null when no staffer or no comment matched), so a
 * caller that must remember what it posted can store it.
 */
export async function recordStaffForPostedComment(args: {
  orgId: OrgId;
  ticketId: number;
  staffId: number;
  body: string;
  helpdesk: HelpdeskProvider;
}): Promise<number | null> {
  if (!args.staffId) return null;
  const want = args.body.trim();
  const listed = await args.helpdesk.listComments(args.ticketId, { perPage: 100 });
  const comments = listed.comments ?? [];
  const match =
    [...comments].reverse().find((c) => (c.body ?? '').trim() === want) ?? comments.at(-1);
  if (!match?.id) return null;
  await recordHelpdeskCommentStaff({
    orgId: args.orgId,
    ticketId: args.ticketId,
    commentId: match.id,
    staffId: args.staffId,
  });
  return match.id;
}
