import 'server-only';

/**
 * Real tenant bindings for the task desk store.
 *
 * `list-tasks.ts` holds the SQL and the mapping and imports nothing that
 * touches the pool, so its tests run DB-free and a client surface can import
 * its types. This file is the one place those two halves are joined — the same
 * split `create-task-core.ts` / `create-task-deps.ts` already uses.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

import {
  patchTaskDeskRowInTx,
  type PatchTaskDeskResult,
  type TaskDeskDeps,
  type TaskDeskPatch,
} from './list-tasks';

export const taskDeskDbDeps: TaskDeskDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

/** One transaction; the trigger records the actor's work/completion atomically. */
export async function patchTaskDeskRow(
  orgId: OrgId,
  taskId: number,
  patch: TaskDeskPatch,
  actorStaffId: number | null,
): Promise<PatchTaskDeskResult> {
  return withTenantTransaction(orgId, async (client) => {
    await client.query(`SELECT set_config('app.current_staff', $1::text, true)`, [actorStaffId == null ? '' : String(actorStaffId)]);
    return patchTaskDeskRowInTx(orgId, taskId, patch, {
      query: async (sql, params) => {
        const res = await client.query(sql, params);
        return { rows: res.rows as Array<Record<string, unknown>>, rowCount: res.rowCount };
      },
    });
  });
}
