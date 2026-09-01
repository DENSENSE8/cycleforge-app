/**
 * Shared ORDER/TEST|PACK work_assignment upsert.
 *
 * Extracted from `/api/orders/assign` so ingest, listing automations, and the
 * HTTP assign route share one waist. Never writes orders.* assignee columns —
 * work_assignments is the SoT (warehouse-os S11).
 *
 * For TEST: promotes an OPEN canonical deadline row to ASSIGNED rather than
 * inserting a second active row.
 */

import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';

export type OrderWorkType = 'TEST' | 'PACK';

export type QueryClient = {
  query: PoolClient['query'];
};

/**
 * Upsert a single work_assignment row for a given order + work_type.
 * `staffId === null` cancels active ASSIGNED/IN_PROGRESS rows (leaves OPEN).
 */
export async function upsertOrderAssignment(
  organizationId: string,
  orderId: number,
  workType: OrderWorkType,
  staffId: number | null,
  client: QueryClient = pool,
): Promise<void> {
  const col = workType === 'PACK' ? 'assigned_packer_id' : 'assigned_tech_id';

  if (staffId === null) {
    await client.query(
      `UPDATE work_assignments
       SET status = 'CANCELED', updated_at = NOW()
       WHERE entity_type = 'ORDER'
         AND entity_id   = $1
         AND work_type   = $2
         AND status IN ('ASSIGNED', 'IN_PROGRESS')`,
      [orderId, workType],
    );
    return;
  }

  const activeStatuses =
    workType === 'TEST'
      ? "('OPEN', 'ASSIGNED', 'IN_PROGRESS')"
      : "('ASSIGNED', 'IN_PROGRESS')";

  const existing = await client.query(
    `SELECT id, ${col} AS assignee_id, status
     FROM work_assignments
     WHERE entity_type = 'ORDER'
       AND entity_id   = $1
       AND work_type   = $2
       AND status IN ${activeStatuses}
     ORDER BY
       CASE status WHEN 'ASSIGNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'OPEN' THEN 3 END,
       id DESC
     LIMIT 1`,
    [orderId, workType],
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE work_assignments
       SET ${col} = $1, status = 'ASSIGNED', updated_at = NOW()
       WHERE id = $2`,
      [staffId, existing.rows[0].id],
    );
  } else {
    await client.query(
      `INSERT INTO work_assignments (organization_id, entity_type, entity_id, work_type, ${col}, status, priority)
       VALUES ($1, 'ORDER', $2, $3, $4, 'ASSIGNED', 100)
       ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
      [organizationId, orderId, workType, staffId],
    );
  }
}

/**
 * Read the current assignee for an active ORDER assignment, if any.
 * Used by automations to avoid clobbering a human assign.
 */
export async function getActiveOrderAssignee(
  orderId: number,
  workType: OrderWorkType,
  client: QueryClient = pool,
): Promise<{ staffId: number | null; status: string } | null> {
  const col = workType === 'PACK' ? 'assigned_packer_id' : 'assigned_tech_id';
  const activeStatuses =
    workType === 'TEST'
      ? "('OPEN', 'ASSIGNED', 'IN_PROGRESS')"
      : "('ASSIGNED', 'IN_PROGRESS')";

  const existing = await client.query(
    `SELECT ${col} AS assignee_id, status
     FROM work_assignments
     WHERE entity_type = 'ORDER'
       AND entity_id   = $1
       AND work_type   = $2
       AND status IN ${activeStatuses}
     ORDER BY
       CASE status WHEN 'ASSIGNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'OPEN' THEN 3 END,
       id DESC
     LIMIT 1`,
    [orderId, workType],
  );
  if (existing.rows.length === 0) return null;
  const row = existing.rows[0] as { assignee_id: number | null; status: string };
  return {
    staffId: row.assignee_id == null ? null : Number(row.assignee_id),
    status: String(row.status),
  };
}

/**
 * Upsert the canonical ORDER/TEST work_assignment row's deadline_at.
 * Creates an OPEN row if no active TEST row exists.
 */
export async function upsertOrderDeadline(
  organizationId: string,
  orderId: number,
  deadlineAt: string | null,
  client: QueryClient = pool,
): Promise<void> {
  const existing = await client.query(
    `SELECT id
     FROM work_assignments
     WHERE entity_type = 'ORDER'
       AND entity_id   = $1
       AND work_type   = 'TEST'
       AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
     ORDER BY
       CASE status WHEN 'ASSIGNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'OPEN' THEN 3 END,
       id DESC
     LIMIT 1`,
    [orderId],
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE work_assignments
       SET deadline_at = $1, updated_at = NOW()
       WHERE id = $2`,
      [deadlineAt ?? null, existing.rows[0].id],
    );
  } else {
    await client.query(
      `INSERT INTO work_assignments
         (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, deadline_at)
       VALUES ($1, 'ORDER', $2, 'TEST', NULL, 'OPEN', 100, $3)
       ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
      [organizationId, orderId, deadlineAt ?? null],
    );
  }
}
