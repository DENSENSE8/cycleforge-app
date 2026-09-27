/**
 * ChatWrites goldens' DB side: read back what a confirmed order-status / task
 * write did, and put everything back (flags, shortages, the task and its
 * links/assignees/inbox rows, the agent mutations) so the eval leaves nothing.
 */

import { Pool } from 'pg';

type Q = <R>(sql: string, params: unknown[]) => Promise<R[]>;

async function withDb<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

/** The seed order the goldens act on (4 lines, test data). */
export const CHAT_WRITES_ORDER = 'CF-ML-5LINE-SEED';

export interface OrderLineState {
  id: number;
  flag: string | null;
  is_out_of_stock: boolean;
}

export function readOrderLines(orgId: string, orderNumber: string): Promise<OrderLineState[]> {
  return withDb((q) =>
    q<OrderLineState>(
      `SELECT o.id, f.flag, COALESCE(o.is_out_of_stock, false) AS is_out_of_stock
         FROM orders o LEFT JOIN order_flags f ON f.order_id = o.id AND f.organization_id = o.organization_id
        WHERE o.organization_id = $1 AND o.order_id = $2 ORDER BY o.id`,
      [orgId, orderNumber],
    ),
  );
}

/** Undo the golden's flag / shortage writes on the seed order and drop this run's chat mutations. */
export function cleanupOrderWrites(orgId: string, orderNumber: string, since: Date): Promise<void> {
  return withDb(async (q) => {
    const ids = (await q<{ id: number }>(`SELECT id FROM orders WHERE organization_id = $1 AND order_id = $2`, [orgId, orderNumber])).map((r) => r.id);
    await q(`DELETE FROM order_flags WHERE organization_id = $1 AND order_id = ANY($2::int[])`, [orgId, ids]);
    await q(`DELETE FROM order_line_shortages WHERE organization_id = $1 AND order_id = ANY($2::int[]) AND created_by = 'assistant' AND created_at >= $3`, [orgId, ids, since]);
    await q(
      `UPDATE orders SET is_out_of_stock = false, oos_kind = NULL, oos_sku = NULL, oos_sku_catalog_id = NULL, oos_kit_part_id = NULL,
              oos_qty_short = NULL, oos_title = NULL, oos_zoho_item_id = NULL
        WHERE organization_id = $1 AND id = ANY($2::int[])
          AND NOT EXISTS (SELECT 1 FROM order_line_shortages s WHERE s.organization_id = $1 AND s.order_id = orders.id AND s.status <> 'cleared')`,
      [orgId, ids],
    );
    await q(
      `DELETE FROM agent_mutations WHERE organization_id = $1 AND created_at >= $2
          AND mutation_kind IN ('order.set_flag','order.mark_out_of_stock','order.clear_out_of_stock','order.scan_out')`,
      [orgId, since],
    );
  });
}

/** Proposed / applied chat mutations of a kind since the run began. */
export function countMutations(orgId: string, kind: string, since: Date, status: string): Promise<number> {
  return withDb(async (q) =>
    Number((await q<{ n: string }>(`SELECT count(*) n FROM agent_mutations WHERE organization_id = $1 AND mutation_kind = $2 AND created_at >= $3 AND status = $4`, [orgId, kind, since, status]))[0].n),
  );
}

export interface CreatedTask {
  id: number;
  notes: string | null;
  remind_at: Date | null;
  entity_id: number | null;
  assignees: string[];
}

/** The task the confirmation created this run (newest). */
export function readCreatedTask(orgId: string, since: Date): Promise<CreatedTask | null> {
  return withDb(async (q) =>
    (await q<CreatedTask>(
      `SELECT w.id, w.notes, w.remind_at, w.entity_id,
              ARRAY(SELECT s.name FROM work_assignment_assignees a JOIN staff s ON s.id = a.staff_id
                     WHERE a.organization_id = w.organization_id AND a.assignment_id = w.id ORDER BY s.name) AS assignees
         FROM work_assignments w
         JOIN agent_mutations m ON m.organization_id = w.organization_id AND m.mutation_kind = 'task.create'
                               AND m.status = 'applied' AND m.created_at >= $2 AND m.extra_audit #>> '{inverse,payload,cancelTaskId}' = w.id::text
        WHERE w.organization_id = $1
        ORDER BY w.id DESC LIMIT 1`,
      [orgId, since],
    ))[0] ?? null,
  );
}

export function cleanupTasks(orgId: string, since: Date): Promise<void> {
  return withDb(async (q) => {
    const ids = (await q<{ id: string }>(
      `SELECT extra_audit #>> '{inverse,payload,cancelTaskId}' AS id FROM agent_mutations
        WHERE organization_id = $1 AND mutation_kind = 'task.create' AND created_at >= $2 AND extra_audit ? 'inverse'`,
      [orgId, since],
    )).map((r) => Number(r.id)).filter((n) => n > 0);
    if (ids.length) {
      await q(`DELETE FROM staff_inbox_items WHERE organization_id = $1 AND (payload->>'workAssignmentId')::int = ANY($2::int[])`, [orgId, ids]);
      await q(`DELETE FROM work_assignment_links WHERE organization_id = $1 AND assignment_id = ANY($2::int[])`, [orgId, ids]);
      await q(`DELETE FROM work_assignment_assignees WHERE organization_id = $1 AND assignment_id = ANY($2::int[])`, [orgId, ids]);
      await q(`DELETE FROM work_assignments WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
    }
    await q(`DELETE FROM agent_mutations WHERE organization_id = $1 AND mutation_kind = 'task.create' AND created_at >= $2`, [orgId, since]);
  });
}

/** Open shortages the assistant opened on the order this run — 0 after cleanup. */
export function countAssistantShortages(orgId: string, orderNumber: string, since: Date): Promise<number> {
  return withDb(async (q) =>
    Number((await q<{ n: string }>(
      `SELECT count(*) n FROM order_line_shortages s JOIN orders o ON o.id = s.order_id AND o.organization_id = s.organization_id
        WHERE s.organization_id = $1 AND o.order_id = $2 AND s.created_by = 'assistant' AND s.created_at >= $3 AND s.status <> 'cleared'`,
      [orgId, orderNumber, since],
    ))[0].n),
  );
}
