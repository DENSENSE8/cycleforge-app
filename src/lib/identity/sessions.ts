/** Session-collapse GROUNDWORK — switch the active org/staff context of an existing session IN PLACE, without minting a new session. */

import type { Pool, PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

type Executor = Pool | PoolClient;

interface SwitchActiveContextTarget {
  orgId: OrgId;
  staffId: number;
}

interface SwitchActiveContextResult {
  /** True when an active, non-revoked session row was re-pointed. */
  updated: boolean;
}

/**
 * Collaborators for {@link switchActiveContext}. Defaults hit the live pool
 * inside a single `withTenantTransaction`; unit tests pass fakes.
 */
export interface SwitchActiveContextDeps {
  /** Update the active-context pointers on a live (non-revoked) session.
   *  Returns the number of rows affected (0 = no such active session). */
  updatePointers(
    sessionId: string,
    orgId: OrgId,
    staffId: number,
    db: Executor,
  ): Promise<number>;
  transaction<T>(orgId: OrgId, fn: (db: Executor) => Promise<T>): Promise<T>;
}

const defaultSwitchActiveContextDeps: SwitchActiveContextDeps = {
  async updatePointers(sessionId, orgId, staffId, db) {
    const r = await db.query(
      `UPDATE staff_sessions
          SET active_org_id = $2, active_staff_id = $3
        WHERE sid = $1 AND revoked_at IS NULL`,
      [sessionId, orgId, staffId],
    );
    return r.rowCount ?? 0;
  },
  transaction(orgId, fn) {
    return withTenantTransaction(orgId, (client) => fn(client));
  },
};

/** Re-point a session's active org/staff context in place (no re-mint). */
export async function switchActiveContext(
  sessionId: string,
  target: SwitchActiveContextTarget,
  deps: SwitchActiveContextDeps = defaultSwitchActiveContextDeps,
): Promise<SwitchActiveContextResult> {
  const affected = await deps.transaction(target.orgId, (db) =>
    deps.updatePointers(sessionId, target.orgId, target.staffId, db),
  );
  return { updated: affected > 0 };
}
