/** Thread assignment domain — one staff OWNER per entity thread (conversation ownership; migration 2026-07-15_thread_crud_connections.sql). */

import { withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ThreadsDeps } from './threads';
import type { ThreadAssignment } from './types';

const defaultDeps: ThreadsDeps = {
  runQuery: (orgId, fn) => withTenantConnection(orgId, (client) => fn(client)),
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
};

function mapAssignment(row: Record<string, unknown>): ThreadAssignment {
  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    threadId: Number(row.thread_id),
    assignedStaffId: Number(row.assigned_staff_id),
    assignedStaffName: row.assigned_staff_name == null ? null : String(row.assigned_staff_name),
    assignedBy: row.assigned_by == null ? null : Number(row.assigned_by),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── getThreadAssignment ─────────────────────────────────────────────────────

export async function getThreadAssignment(
  orgId: OrgId,
  threadId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<ThreadAssignment | null> {
  return deps.runQuery(orgId, async (client) => {
    const res = await client.query(
      `SELECT ta.thread_id, ta.assigned_staff_id, ta.assigned_by, ta.created_at, ta.updated_at,
              s.name AS assigned_staff_name
         FROM thread_assignments ta
         LEFT JOIN staff s ON s.id = ta.assigned_staff_id AND s.organization_id = ta.organization_id
        WHERE ta.thread_id = $1::bigint AND ta.organization_id = $2::uuid`,
      [threadId, orgId],
    );
    return res.rows.length ? mapAssignment(res.rows[0]) : null;
  });
}

// ─── assignThread (upsert-to-reassign) ───────────────────────────────────────

interface AssignThreadInput {
  orgId: OrgId;
  threadId: number;
  assignedStaffId: number;
  assignedBy?: number | null;
}

type AssignThreadResult =
  | { ok: true; assignment: ThreadAssignment; reassigned: boolean; previousStaffId: number | null }
  | { ok: false; status: 400 | 404; error: string };

export async function assignThread(
  input: AssignThreadInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<AssignThreadResult> {
  if (!Number.isSafeInteger(input.assignedStaffId) || input.assignedStaffId <= 0) {
    return { ok: false, status: 400, error: `invalid assignedStaffId ${input.assignedStaffId}` };
  }
  return deps.runTransaction(input.orgId, async (client) => {
    // Thread must exist and be live.
    const thread = await client.query(
      `SELECT 1 FROM entity_threads
        WHERE id = $1::bigint AND organization_id = $2::uuid AND deleted_at IS NULL`,
      [input.threadId, input.orgId],
    );
    if (thread.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    // Assignee must be a real staffer in this org.
    const staffRow = await client.query(
      `SELECT 1 FROM staff WHERE id = $1::int AND organization_id = $2::uuid`,
      [input.assignedStaffId, input.orgId],
    );
    if (staffRow.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `staff ${input.assignedStaffId} not found` };
    }

    const prev = await client.query(
      `SELECT assigned_staff_id FROM thread_assignments
        WHERE thread_id = $1::bigint AND organization_id = $2::uuid`,
      [input.threadId, input.orgId],
    );
    const previousStaffId = prev.rows.length ? Number(prev.rows[0].assigned_staff_id) : null;

    const res = await client.query(
      `INSERT INTO thread_assignments (organization_id, thread_id, assigned_staff_id, assigned_by)
       VALUES ($1::uuid, $2::bigint, $3::int, $4::int)
       ON CONFLICT (organization_id, thread_id)
         DO UPDATE SET assigned_staff_id = EXCLUDED.assigned_staff_id,
                       assigned_by = EXCLUDED.assigned_by,
                       updated_at = now()
       RETURNING thread_id, assigned_staff_id, assigned_by, created_at, updated_at`,
      [input.orgId, input.threadId, input.assignedStaffId, input.assignedBy ?? null],
    );
    return {
      ok: true as const,
      assignment: mapAssignment(res.rows[0]),
      reassigned: previousStaffId != null && previousStaffId !== input.assignedStaffId,
      previousStaffId,
    };
  });
}

// ─── unassignThread (delete-to-clear) ────────────────────────────────────────

type UnassignThreadResult =
  | { ok: true; idempotent: boolean; previousStaffId: number | null }
  | { ok: false; status: 404; error: string };

export async function unassignThread(
  orgId: OrgId,
  threadId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<UnassignThreadResult> {
  return deps.runTransaction(orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM thread_assignments
        WHERE thread_id = $1::bigint AND organization_id = $2::uuid
        RETURNING assigned_staff_id`,
      [threadId, orgId],
    );
    if (res.rows.length === 0) {
      return { ok: true as const, idempotent: true, previousStaffId: null };
    }
    return { ok: true as const, idempotent: false, previousStaffId: Number(res.rows[0].assigned_staff_id) };
  });
}
