/** Cycle Forge staff identity on helpdesk comments. */

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

/** Staff by NAME — the sign-off fallback. */
export async function staffAuthorsByName(
  orgId: OrgId,
  names: string[],
): Promise<Map<string, StaffAuthorHit>> {
  const cleaned = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, StaffAuthorHit>();
  if (!cleaned.length) return out;
  try {
    const { rows } = await tenantQuery<{ id: number; name: string }>(
      orgId,
      `SELECT id, name
         FROM staff
        WHERE organization_id = $1
          AND lower(trim(name)) = ANY($2::text[])`,
      [orgId, cleaned],
    );
    const ambiguous = new Set<string>();
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      if (!key) continue;
      if (out.has(key)) {
        ambiguous.add(key);
        continue;
      }
      out.set(key, { staffId: Number(row.id), name: row.name });
    }
    for (const key of ambiguous) out.delete(key);
  } catch (err) {
    console.warn('[helpdesk] staff name lookup failed', err);
  }
  return out;
}
