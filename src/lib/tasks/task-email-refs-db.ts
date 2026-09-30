import 'server-only';

/**
 * Real tenant bindings for task email references (`work_assignment_email_refs`).
 *
 * Until `2026-09-29_work_assignment_email_refs.sql` is applied the table does
 * not exist: reads answer `ready: false` (the UI paints "not set up yet") and
 * writes refuse `not_set_up` — never a 500.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrganization } from '@/lib/tenancy/organizations';
import { findTaskAnchor } from './task-links-db';
import { mergeTaskEmailRefPatch, normalizeTaskEmailRef, taskEmailMailboxes } from './task-email-refs';
import type {
  TaskEmailRef,
  TaskEmailRefCreateBody,
  TaskEmailRefPatchBody,
  TaskEmailRefRefusal,
  TaskEmailRefsPayload,
} from './task-email-refs-shared';

const REF_COLUMNS = `
  r.id, r.assignment_id, r.customer_email, r.mailbox, r.order_number,
  r.reference_number, r.subject, r.created_by_staff_id, s.name AS created_by_name,
  r.created_at, r.updated_at`;

const STAFF_JOIN = `
  LEFT JOIN staff s
    ON s.id = r.created_by_staff_id
   AND s.organization_id = r.organization_id`;

/** 42P01 on THIS table only — any other missing relation is a real fault. */
function isTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === '42P01' && String(e.message ?? '').includes('work_assignment_email_refs');
}

function mapRow(row: Record<string, unknown>): TaskEmailRef {
  return {
    id: Number(row.id),
    taskId: Number(row.assignment_id),
    customerEmail: String(row.customer_email),
    mailbox: String(row.mailbox),
    orderNumber: (row.order_number as string | null) ?? null,
    referenceNumber: (row.reference_number as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    createdByStaffId: row.created_by_staff_id == null ? null : Number(row.created_by_staff_id),
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

/** References on one task (oldest first) + the org's mailbox vocabulary; null when the id is not a task in this org. */
export async function listTaskEmailRefs(orgId: OrgId, taskId: number): Promise<TaskEmailRefsPayload | null> {
  const [anchor, org] = await Promise.all([findTaskAnchor(orgId, taskId), getOrganization(orgId)]);
  const letterhead = org?.settings.letterhead?.email ?? '';
  if (!anchor) return null;
  try {
    const [refs, used] = await Promise.all([
      tenantQuery(
        orgId,
        `SELECT ${REF_COLUMNS}
           FROM work_assignment_email_refs r
           ${STAFF_JOIN}
          WHERE r.organization_id = $1::uuid AND r.assignment_id = $2
          ORDER BY r.created_at, r.id`,
        [orgId, taskId],
      ),
      // The org's own vocabulary grows with use: every mailbox it has recorded, most used first.
      tenantQuery<{ mailbox: string }>(
        orgId,
        `SELECT mailbox
           FROM work_assignment_email_refs
          WHERE organization_id = $1::uuid
          GROUP BY mailbox
          ORDER BY count(*) DESC, mailbox
          LIMIT 24`,
        [orgId],
      ),
    ]);
    return {
      ok: true,
      ready: true,
      refs: refs.rows.map(mapRow),
      mailboxes: taskEmailMailboxes(letterhead, used.rows.map((row) => row.mailbox)),
    };
  } catch (error) {
    if (!isTableMissing(error)) throw error;
    return { ok: true, ready: false, refs: [], mailboxes: taskEmailMailboxes(letterhead, []) };
  }
}

export type TaskEmailRefWriteResult =
  | { ok: true; ref: TaskEmailRef; before: TaskEmailRef | null; changed: boolean }
  | { ok: false; reason: TaskEmailRefRefusal };

export async function createTaskEmailRef(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskEmailRefCreateBody,
): Promise<TaskEmailRefWriteResult> {
  const normalized = normalizeTaskEmailRef(body);
  if (!normalized.ok) return normalized;
  const v = normalized.value;
  if (!(await findTaskAnchor(orgId, taskId))) return { ok: false, reason: 'task_not_found' };
  try {
    const res = await tenantQuery(
      orgId,
      `WITH r AS (
         INSERT INTO work_assignment_email_refs
           (organization_id, assignment_id, customer_email, mailbox, order_number,
            reference_number, subject, created_by_staff_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *
       )
       SELECT ${REF_COLUMNS} FROM r ${STAFF_JOIN}`,
      [orgId, taskId, v.customerEmail, v.mailbox, v.orderNumber, v.referenceNumber, v.subject, staffId],
    );
    return { ok: true, ref: mapRow(res.rows[0]), before: null, changed: true };
  } catch (error) {
    if (isTableMissing(error)) return { ok: false, reason: 'not_set_up' };
    throw error;
  }
}

/** Re-point any fact of one reference; a patch that changes nothing writes nothing. */
export async function updateTaskEmailRef(
  orgId: OrgId,
  taskId: number,
  refId: number,
  patch: TaskEmailRefPatchBody,
): Promise<TaskEmailRefWriteResult> {
  if (!(await findTaskAnchor(orgId, taskId))) return { ok: false, reason: 'task_not_found' };
  try {
    return await withTenantTransaction(orgId, async (client): Promise<TaskEmailRefWriteResult> => {
      const current = await client.query(
        `SELECT ${REF_COLUMNS}
           FROM work_assignment_email_refs r
           ${STAFF_JOIN}
          WHERE r.organization_id = $1::uuid AND r.assignment_id = $2 AND r.id = $3
          FOR UPDATE OF r`,
        [orgId, taskId, refId],
      );
      if (!current.rows[0]) return { ok: false, reason: 'ref_not_found' };
      const before = mapRow(current.rows[0]);
      const normalized = normalizeTaskEmailRef(mergeTaskEmailRefPatch(before, patch));
      if (!normalized.ok) return normalized;
      const v = normalized.value;
      const unchanged =
        v.customerEmail === before.customerEmail &&
        v.mailbox === before.mailbox &&
        v.orderNumber === before.orderNumber &&
        v.referenceNumber === before.referenceNumber &&
        v.subject === before.subject;
      if (unchanged) return { ok: true, ref: before, before, changed: false };
      const updated = await client.query(
        `WITH r AS (
           UPDATE work_assignment_email_refs
              SET customer_email = $4, mailbox = $5, order_number = $6,
                  reference_number = $7, subject = $8, updated_at = now()
            WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
            RETURNING *
         )
         SELECT ${REF_COLUMNS} FROM r ${STAFF_JOIN}`,
        [orgId, taskId, refId, v.customerEmail, v.mailbox, v.orderNumber, v.referenceNumber, v.subject],
      );
      return { ok: true, ref: mapRow(updated.rows[0]), before, changed: true };
    });
  } catch (error) {
    if (isTableMissing(error)) return { ok: false, reason: 'not_set_up' };
    throw error;
  }
}

export type DeleteTaskEmailRefResult =
  | { ok: true; removed: TaskEmailRef | null }
  | { ok: false; reason: Extract<TaskEmailRefRefusal, 'task_not_found' | 'not_set_up'> };

/** Idempotent: removing an already-removed reference is `removed: null`, not an error. */
export async function deleteTaskEmailRef(orgId: OrgId, taskId: number, refId: number): Promise<DeleteTaskEmailRefResult> {
  if (!(await findTaskAnchor(orgId, taskId))) return { ok: false, reason: 'task_not_found' };
  try {
    const res = await tenantQuery(
      orgId,
      `WITH r AS (
         DELETE FROM work_assignment_email_refs
          WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
          RETURNING *
       )
       SELECT ${REF_COLUMNS} FROM r ${STAFF_JOIN}`,
      [orgId, taskId, refId],
    );
    return { ok: true, removed: res.rows[0] ? mapRow(res.rows[0]) : null };
  } catch (error) {
    if (isTableMissing(error)) return { ok: false, reason: 'not_set_up' };
    throw error;
  }
}
