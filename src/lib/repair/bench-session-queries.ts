import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  RepairBenchSessionRecord,
  RepairBenchSessionsResponse,
} from '@/lib/repair/bench-session';

/**
 * Bench timer queries (`repair_bench_sessions`) behind
 * `/api/repair/bench-sessions`. Start and Stop stamp `NOW()` in the database;
 * nothing here accepts a client time. Org-scoped explicitly on every statement.
 */

const SESSION_SELECT = `
  SELECT b.id::int AS id, b.repair_id, b.staff_id, s.name AS staff_name,
         b.started_at, b.ended_at
    FROM repair_bench_sessions b
    LEFT JOIN staff s ON s.id = b.staff_id`;

/** Transaction-start `NOW()` — the same instant any Start/Stop in this transaction stamps. */
async function serverNow(client: PoolClient): Promise<string> {
  const r = await client.query<{ now: Date }>(`SELECT NOW() AS now`);
  return r.rows[0].now.toISOString();
}

async function repairExists(client: PoolClient, orgId: OrgId, repairId: number): Promise<boolean> {
  const r = await client.query(`SELECT 1 FROM repair_service WHERE id = $1 AND organization_id = $2`, [
    repairId,
    orgId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** Every session on a repair (newest first), the caller's open one, and the server clock. */
export async function listBenchSessions(
  orgId: OrgId,
  staffId: number,
  repairId: number,
): Promise<RepairBenchSessionsResponse> {
  return withTenantTransaction(orgId, async (client) => {
    const rows = await client.query<RepairBenchSessionRecord>(
      `${SESSION_SELECT}
        WHERE b.organization_id = $1 AND b.repair_id = $2
        ORDER BY b.started_at DESC, b.id DESC`,
      [orgId, repairId],
    );
    return {
      sessions: rows.rows,
      open: rows.rows.find((s) => s.staff_id === staffId && s.ended_at == null) ?? null,
      serverNow: await serverNow(client),
    };
  });
}

type BenchSessionWriteResult =
  | { ok: true; session: RepairBenchSessionRecord; changed: boolean; serverNow: string }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Start the caller's timer on a repair. Idempotent: a second Start while one
 * is open returns the open session (`changed: false`) — the partial unique
 * index makes a double-tap unable to open two.
 */
export async function startBenchSession(
  orgId: OrgId,
  staffId: number,
  repairId: number,
): Promise<BenchSessionWriteResult> {
  return withTenantTransaction(orgId, async (client) => {
    if (!(await repairExists(client, orgId, repairId))) {
      return { ok: false, status: 404, error: 'Repair not found' };
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO repair_bench_sessions (organization_id, repair_id, staff_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, repair_id, staff_id) WHERE ended_at IS NULL DO NOTHING
       RETURNING id`,
      [orgId, repairId, staffId],
    );
    const row = await client.query<RepairBenchSessionRecord>(
      `${SESSION_SELECT}
        WHERE b.organization_id = $1 AND b.repair_id = $2 AND b.staff_id = $3 AND b.ended_at IS NULL`,
      [orgId, repairId, staffId],
    );
    return {
      ok: true,
      session: row.rows[0],
      changed: (inserted.rowCount ?? 0) > 0,
      serverNow: await serverNow(client),
    };
  });
}

/** Stop the caller's open timer on a repair; `ended_at = NOW()`. 409 when none is running. */
export async function stopBenchSession(
  orgId: OrgId,
  staffId: number,
  repairId: number,
): Promise<BenchSessionWriteResult> {
  return withTenantTransaction(orgId, async (client) => {
    if (!(await repairExists(client, orgId, repairId))) {
      return { ok: false, status: 404, error: 'Repair not found' };
    }
    const stopped = await client.query<{ id: string }>(
      `UPDATE repair_bench_sessions SET ended_at = NOW()
        WHERE organization_id = $1 AND repair_id = $2 AND staff_id = $3 AND ended_at IS NULL
        RETURNING id`,
      [orgId, repairId, staffId],
    );
    if (stopped.rowCount === 0) {
      return { ok: false, status: 409, error: 'No bench timer is running for you on this repair.' };
    }
    const row = await client.query<RepairBenchSessionRecord>(
      `${SESSION_SELECT} WHERE b.organization_id = $1 AND b.id = $2`,
      [orgId, stopped.rows[0].id],
    );
    return { ok: true, session: row.rows[0], changed: true, serverNow: await serverNow(client) };
  });
}
