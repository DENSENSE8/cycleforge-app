import 'server-only';

/** Real tenant bindings for task follow-ups (`work_assignment_follow_ups`). */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { mapTaskFollowUpRow, normalizeTaskFollowUp } from './task-follow-ups';
import type { TaskFollowUp, TaskFollowUpCreateBody, TaskFollowUpRefusal } from './task-follow-ups-shared';
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

/**
 * Insert one follow-up and move the task's denormalised instants in ONE
 * transaction: `last_follow_up_at` only ever moves forward (a back-dated log
 * never un-chases a task); `next_follow_up_at` moves only when the body names it.
 */
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

  const followUp = await withTenantTransaction(orgId, async (client) => {
    const inserted = await client.query(
      `WITH f AS (
         INSERT INTO work_assignment_follow_ups
           (organization_id, assignment_id, channel, direction, occurred_at, staff_id, body)
         VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7)
         RETURNING *
       )
       SELECT ${FOLLOW_UP_COLUMNS} FROM f ${STAFF_JOIN}`,
      [orgId, taskId, v.channel, v.direction, v.occurredAt, staffId, v.body],
    );
    const keepNext = v.nextFollowUpAt === undefined;
    await client.query(
      `UPDATE work_assignments
          SET last_follow_up_at = GREATEST(COALESCE(last_follow_up_at, $3::timestamptz), $3::timestamptz),
              next_follow_up_at = CASE WHEN $4::boolean THEN next_follow_up_at ELSE $5::timestamptz END,
              updated_at = now()
        WHERE organization_id = $1::uuid AND id = $2`,
      [orgId, taskId, v.occurredAt, keepNext, keepNext ? null : v.nextFollowUpAt],
    );
    return mapTaskFollowUpRow(inserted.rows[0] as Record<string, unknown>);
  });
  if (!followUp) throw new Error('work_assignment_follow_ups insert returned no mappable row');
  return { ok: true, followUp, nextFollowUpAt: v.nextFollowUpAt };
}
