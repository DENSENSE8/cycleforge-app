import 'server-only';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  QC_OUTCOMES_BY_KIND,
  type QcSession,
  type QcSessions,
  type QcSessionWrite,
  type QcSessionOutcome,
} from '@/lib/qc/contracts';

/**
 * Unit bench sessions (`qc_sessions`, kinds TEST / REPAIR) behind `/api/qc/sessions`. Start and End
 * stamp `NOW()` in the database — no client clock. Every statement is org-scoped explicitly and runs
 * under the tenant GUC. The repair-ticket timer (kind REPAIR_SERVICE) shares the table but is written
 * by src/lib/repair/bench-session-queries.ts.
 */

const SESSION_SELECT = `
  SELECT q.id::int                AS "id",
         q.kind                   AS "kind",
         q.serial_unit_id         AS "serialUnitId",
         q.repair_service_id      AS "repairServiceId",
         q.location_id            AS "locationId",
         COALESCE(l.display_name, l.name) AS "locationName",
         q.staff_id               AS "staffId",
         s.name                   AS "staffName",
         q.hub_device_id          AS "hubDeviceId",
         to_json(q.started_at) #>> '{}' AS "startedAt",
         to_json(q.ended_at) #>> '{}'   AS "endedAt",
         q.outcome                AS "outcome",
         q.notes                  AS "notes"
    FROM qc_sessions q
    LEFT JOIN locations l ON l.id = q.location_id AND l.organization_id = q.organization_id
    LEFT JOIN staff s     ON s.id = q.staff_id`;

async function serverNow(client: PoolClient): Promise<string> {
  const r = await client.query<{ now: Date }>(`SELECT NOW() AS now`);
  return r.rows[0].now.toISOString();
}

export async function listUnitQcSessions(orgId: OrgId, staffId: number, serialUnitId: number): Promise<QcSessions> {
  return withTenantTransaction(orgId, async (client) => {
    const rows = await client.query<QcSession>(
      `${SESSION_SELECT}
        WHERE q.organization_id = $1 AND q.serial_unit_id = $2
        ORDER BY q.started_at DESC, q.id DESC`,
      [orgId, serialUnitId],
    );
    return {
      sessions: rows.rows,
      open: rows.rows.find((s) => s.staffId === staffId && s.endedAt == null) ?? null,
      serverNow: await serverNow(client),
    };
  });
}

export type QcSessionWriteResult = ({ ok: true } & QcSessionWrite) | { ok: false; status: 404 | 409; error: string };

interface StartArgs {
  kind: 'TEST' | 'REPAIR';
  serialUnitId: number;
  locationId?: number | null;
  hubDeviceId?: string | null;
}

/**
 * Open the caller's session on a unit. Idempotent: while the caller already has one open on the unit
 * (any kind) that session is returned with `changed: false` — the partial unique index
 * `uq_qc_sessions_unit_open` makes a double-tap unable to open two.
 */
export async function startQcSession(orgId: OrgId, staffId: number, args: StartArgs): Promise<QcSessionWriteResult> {
  return withTenantTransaction(orgId, async (client) => {
    const unit = await client.query(`SELECT 1 FROM serial_units WHERE id = $1 AND organization_id = $2`, [
      args.serialUnitId,
      orgId,
    ]);
    if (unit.rowCount === 0) return { ok: false, status: 404, error: 'Unit not found' };
    if (args.locationId != null) {
      const loc = await client.query(`SELECT 1 FROM locations WHERE id = $1 AND organization_id = $2`, [
        args.locationId,
        orgId,
      ]);
      if (loc.rowCount === 0) return { ok: false, status: 404, error: 'Bench location not found' };
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO qc_sessions (organization_id, kind, serial_unit_id, staff_id, location_id, hub_device_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, serial_unit_id, staff_id)
         WHERE ended_at IS NULL AND serial_unit_id IS NOT NULL
       DO NOTHING
       RETURNING id::int AS id`,
      [orgId, args.kind, args.serialUnitId, staffId, args.locationId ?? null, args.hubDeviceId ?? null],
    );
    const open = await client.query<QcSession>(
      `${SESSION_SELECT}
        WHERE q.organization_id = $1 AND q.serial_unit_id = $2 AND q.staff_id = $3 AND q.ended_at IS NULL`,
      [orgId, args.serialUnitId, staffId],
    );
    return { ok: true, session: open.rows[0], changed: (inserted.rowCount ?? 0) > 0, serverNow: await serverNow(client) };
  });
}

/**
 * End one of the caller's unit sessions; `ended_at = NOW()`. Ending an already-ended session returns
 * it unchanged (`changed: false`) so a retried End is harmless. Another tech's session → 409.
 */
export async function endQcSession(
  orgId: OrgId,
  staffId: number,
  sessionId: number,
  args: { outcome?: QcSessionOutcome | null; notes?: string | null },
): Promise<QcSessionWriteResult> {
  return withTenantTransaction(orgId, async (client) => {
    const current = await client.query<{ kind: QcSession['kind']; staff_id: number | null; ended: boolean }>(
      `SELECT kind, staff_id, ended_at IS NOT NULL AS ended
         FROM qc_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [sessionId, orgId],
    );
    const row = current.rows[0];
    if (!row || row.kind === 'REPAIR_SERVICE') return { ok: false, status: 404, error: 'Session not found' };
    if (row.staff_id !== staffId) return { ok: false, status: 409, error: 'That session belongs to another tech.' };
    const outcome = args.outcome ?? null;
    if (outcome != null && !QC_OUTCOMES_BY_KIND[row.kind].includes(outcome)) {
      return { ok: false, status: 409, error: `${outcome} does not close a ${row.kind} session.` };
    }
    if (!row.ended) {
      await client.query(
        `UPDATE qc_sessions SET ended_at = NOW(), outcome = $3, notes = $4
          WHERE id = $1 AND organization_id = $2`,
        [sessionId, orgId, outcome, args.notes ?? null],
      );
    }
    const session = await client.query<QcSession>(`${SESSION_SELECT} WHERE q.organization_id = $1 AND q.id = $2`, [
      orgId,
      sessionId,
    ]);
    return { ok: true, session: session.rows[0], changed: !row.ended, serverNow: await serverNow(client) };
  });
}
