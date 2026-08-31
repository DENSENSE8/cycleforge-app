/**
 * Cycle Forge staff identity on helpdesk comments.
 *
 * App-posted replies go out through a shared Zendesk API user. We stamp the
 * real `staff.id` here so the thread can render {@link StaffAvatar} instead of
 * the Zendesk agent photo. Comments written in Zendesk have no row and keep
 * the helpdesk identity (unless `staff.email` matches the agent).
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { HelpdeskProvider } from './types';
import type { StaffAuthorHit } from './comment-staff-identity';

export type { StaffAuthorHit } from './comment-staff-identity';
export { applyStaffAuthor } from './comment-staff-identity';

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

/** After a post, bind the newest matching comment to the posting staffer. */
export async function recordStaffForPostedComment(args: {
  orgId: OrgId;
  ticketId: number;
  staffId: number;
  body: string;
  helpdesk: HelpdeskProvider;
}): Promise<void> {
  if (!args.staffId) return;
  const want = args.body.trim();
  const listed = await args.helpdesk.listComments(args.ticketId, { perPage: 100 });
  const comments = listed.comments ?? [];
  const match =
    [...comments].reverse().find((c) => (c.body ?? '').trim() === want) ?? comments.at(-1);
  if (!match?.id) return;
  await recordHelpdeskCommentStaff({
    orgId: args.orgId,
    ticketId: args.ticketId,
    commentId: match.id,
    staffId: args.staffId,
  });
}

export async function staffAuthorsByCommentId(
  orgId: OrgId,
  commentIds: number[],
): Promise<Map<number, StaffAuthorHit>> {
  const ids = [...new Set(commentIds.filter((n) => Number.isInteger(n) && n > 0))];
  const out = new Map<number, StaffAuthorHit>();
  if (!ids.length) return out;
  try {
    const { rows } = await tenantQuery<{
      zendesk_comment_id: string | number;
      staff_id: number;
      name: string;
    }>(
      orgId,
      `SELECT h.zendesk_comment_id, h.staff_id, s.name
         FROM helpdesk_comment_staff h
         JOIN staff s ON s.id = h.staff_id AND s.organization_id = h.organization_id
        WHERE h.organization_id = $1
          AND h.zendesk_comment_id = ANY($2::bigint[])`,
      [orgId, ids],
    );
    for (const row of rows) {
      const cid = Number(row.zendesk_comment_id);
      if (!Number.isFinite(cid)) continue;
      out.set(cid, { staffId: Number(row.staff_id), name: row.name });
    }
  } catch (err) {
    console.warn('[helpdesk] comment staff lookup failed', err);
  }
  return out;
}

export async function staffAuthorsByEmail(
  orgId: OrgId,
  emails: string[],
): Promise<Map<string, StaffAuthorHit>> {
  const cleaned = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  const out = new Map<string, StaffAuthorHit>();
  if (!cleaned.length) return out;
  try {
    const { rows } = await tenantQuery<{ id: number; name: string; email: string }>(
      orgId,
      `SELECT id, name, email
         FROM staff
        WHERE organization_id = $1
          AND email IS NOT NULL
          AND lower(email) = ANY($2::text[])`,
      [orgId, cleaned],
    );
    for (const row of rows) {
      const key = row.email.trim().toLowerCase();
      if (!key || out.has(key)) continue;
      out.set(key, { staffId: Number(row.id), name: row.name });
    }
  } catch (err) {
    console.warn('[helpdesk] staff email lookup failed', err);
  }
  return out;
}
