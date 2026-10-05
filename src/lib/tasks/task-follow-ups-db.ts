import 'server-only';

/** Real tenant bindings for task follow-ups (`work_assignment_follow_ups`). */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { mapTaskFollowUpRow, normalizeTaskFollowUp, type NormalizedTaskFollowUp } from './task-follow-ups';
import type { TaskFollowUp, TaskFollowUpChannel, TaskFollowUpCreateBody, TaskFollowUpRefusal } from './task-follow-ups-shared';
import { findTaskAnchor } from './task-links-db';

const FOLLOW_UP_COLUMNS = `
  f.id, f.assignment_id, f.channel, f.direction, f.occurred_at, f.staff_id,
  s.name AS staff_name, f.email_to, f.email_subject, f.body, f.created_at`;

const STAFF_JOIN = `
  LEFT JOIN staff s
    ON s.id = f.staff_id
   AND s.organization_id = f.organization_id`;

/** Follow-ups on one task, newest first; null when the id is not a task in this org. */
export async function listTaskFollowUps(orgId: OrgId, taskId: number): Promise<TaskFollowUp[] | null> {
  if (!(await findTaskAnchor(orgId, taskId))) return null;
  const res = await tenantQuery(
    orgId,
    `SELECT ${FOLLOW_UP_COLUMNS}
       FROM work_assignment_follow_ups f
       ${STAFF_JOIN}
      WHERE f.organization_id = $1::uuid AND f.assignment_id = $2
      ORDER BY f.occurred_at DESC, f.id DESC`,
    [orgId, taskId],
  );
  const followUps: TaskFollowUp[] = [];
  for (const raw of res.rows) {
    const followUp = mapTaskFollowUpRow(raw);
    if (followUp) followUps.push(followUp);
  }
  return followUps;
}

export type LogTaskFollowUpResult =
  | { ok: true; followUp: TaskFollowUp; nextFollowUpAt: string | null | undefined }
  | { ok: false; reason: TaskFollowUpRefusal };

/** The executor `logTaskFollowUpInTx` writes on — a tenant-scoped transaction client. */
export interface TaskFollowUpTx {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface TaskFollowUpWrite extends Omit<NormalizedTaskFollowUp, 'channel'> {
  /** Any stored channel — the Support loop logs `message` (and a logged reply's own channel). */
  channel: TaskFollowUpChannel;
  /** The Support message this row records — one row per message (unique), so a replay logs nothing. */
  threadMessageId?: number | null;
  /**
   * Move `last_follow_up_at` (default true). A customer message or an internal
   * note is on the record but is not US chasing, so the Support loop passes false.
   */
  stampLastFollowUp?: boolean;
}

/**
 * The ONE follow-up writer, on a transaction the caller owns: insert the row
 * and move the task's denormalised instants — `last_follow_up_at` only ever
 * moves forward (a back-dated log never un-chases a task). `next_follow_up_at`
 * is set / cleared when the write names it; otherwise an OUTBOUND chase that
 * stamps clears a chase that is already due (≤ now) — the due chase just
 * happened — and keeps a future one. Null when `threadMessageId` was already
 * logged (nothing written).
 */
export async function logTaskFollowUpInTx(
  client: TaskFollowUpTx,
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  v: TaskFollowUpWrite,
): Promise<TaskFollowUp | null> {
  // A typed chase has no message; only a message-backed row names (and dedupes on) thread_message_id.
  const byMessage = v.threadMessageId != null;
  const inserted = await client.query(
    `WITH f AS (
       INSERT INTO work_assignment_follow_ups
         (organization_id, assignment_id, channel, direction, occurred_at, staff_id, body${byMessage ? ', thread_message_id' : ''})
       VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7${byMessage ? ', $8::bigint' : ''})
       ${byMessage ? 'ON CONFLICT (organization_id, thread_message_id) WHERE thread_message_id IS NOT NULL DO NOTHING' : ''}
       RETURNING *
     )
     SELECT ${FOLLOW_UP_COLUMNS} FROM f ${STAFF_JOIN}`,
    [orgId, taskId, v.channel, v.direction, v.occurredAt, staffId, v.body, ...(byMessage ? [v.threadMessageId] : [])],
  );
  const row = inserted.rows[0];
  if (!row) return null;
  const stampLast = v.stampLastFollowUp !== false;
  const keepNext = v.nextFollowUpAt === undefined;
  const satisfiesDue = stampLast && v.direction === 'outbound';
  if (stampLast || !keepNext) {
    await client.query(
      `UPDATE work_assignments
          SET last_follow_up_at = CASE WHEN $6::boolean
                                       THEN GREATEST(COALESCE(last_follow_up_at, $3::timestamptz), $3::timestamptz)
                                       ELSE last_follow_up_at END,
              next_follow_up_at = CASE WHEN NOT $4::boolean THEN $5::timestamptz
                                       WHEN $7::boolean AND next_follow_up_at <= now() THEN NULL
                                       ELSE next_follow_up_at END,
              updated_at = now()
        WHERE organization_id = $1::uuid AND id = $2`,
      [orgId, taskId, v.occurredAt, keepNext, keepNext ? null : v.nextFollowUpAt, stampLast, satisfiesDue],
    );
  }
  const followUp = mapTaskFollowUpRow(row);
  if (!followUp) throw new Error('work_assignment_follow_ups insert returned no mappable row');
  return followUp;
}

/** Normalise, gate on the task, then {@link logTaskFollowUpInTx} in ONE transaction. */
export async function logTaskFollowUp(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskFollowUpCreateBody,
): Promise<LogTaskFollowUpResult> {
  const normalized = normalizeTaskFollowUp(body, Date.now());
  if (!normalized.ok) return normalized;
  const v = normalized.value;
  if (!(await findTaskAnchor(orgId, taskId))) return { ok: false, reason: 'task_not_found' };

  const followUp = await withTenantTransaction(orgId, (client) => logTaskFollowUpInTx(client, orgId, staffId, taskId, v));
  if (!followUp) throw new Error('work_assignment_follow_ups insert returned no mappable row');
  return { ok: true, followUp, nextFollowUpAt: v.nextFollowUpAt };
}
