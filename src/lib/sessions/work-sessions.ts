/**
 * work_sessions writer — start / park / resume / silent scan-surface sync.
 *
 * Collaborators are injected (`WorkSessionDeps`) so tests never open Postgres.
 * Routes call the default deps, which run inside `withTenantTransaction`.
 *
 * Table: `src/lib/migrations/2026-09-01_work_sessions.sql`.
 */

import { randomUUID } from 'node:crypto';

import type { OrgId } from '@/lib/tenancy/constants';
import { ensureSystemPurposes, mapPurpose, type PurposeQueryable } from './purposes';
import {
  clipActiveMs,
  planScanSync,
  utcDayWindow,
  type LiveScanSession,
} from './scan-session-sync';
import type {
  ScanSessionType,
  SessionIntervalKind,
  SessionKind,
  SessionResult,
  SessionStatus,
  WorkSession,
  WorkSessionPurpose,
} from './types';

export interface SessionQueryable {
  query: (
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface WorkSessionTx {
  ensureSystemPurposes: () => Promise<void>;
  purposeByKey: (key: string) => Promise<WorkSessionPurpose | null>;
  listLiveScanForStaff: (staffId: number) => Promise<WorkSession[]>;
  getById: (id: number) => Promise<WorkSession | null>;
  insertSession: (row: InsertSessionInput) => Promise<WorkSession>;
  patchSession: (id: number, patch: SessionPatch) => Promise<WorkSession>;
  disarmStaffScan: (staffId: number) => Promise<void>;
  closeOpenInterval: (sessionId: number, endedAt: Date) => Promise<void>;
  insertInterval: (row: InsertIntervalInput) => Promise<void>;
  listActiveIntervalsForStaffWindow: (
    staffId: number,
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<Array<{ sessionId: number; startedAt: string; endedAt: string | null }>>;
  listRecentForStaff: (staffId: number, limit: number) => Promise<WorkSession[]>;
}

export interface InsertSessionInput {
  kind: SessionKind;
  scanType: ScanSessionType | null;
  armed: boolean;
  surfaceKey: string | null;
  status: SessionStatus;
  staffId: number;
  clientEventId: string;
  title: string | null;
  purposeId: number | null;
}

export interface SessionPatch {
  status?: SessionStatus;
  armed?: boolean;
  surfaceKey?: string | null;
  endedAt?: string | null;
}

export interface InsertIntervalInput {
  sessionId: number;
  kind: SessionIntervalKind;
  staffId: number;
  startedAt: Date;
}

export interface WorkSessionDeps {
  now: () => Date;
  newClientEventId: () => string;
  withTenantTransaction: <T>(orgId: OrgId, fn: (tx: WorkSessionTx) => Promise<T>) => Promise<T>;
}

const SESSION_COLUMNS = `
  id, organization_id, kind, scan_type, armed, surface_key, status, version,
  staff_id, claimed_by_staff_id, claim_expires_at, device_id, client_event_id,
  started_at, ended_at, state, title, purpose_id, notes, wrap_up, wrap_up_source
`;

export function mapSession(row: Record<string, unknown>): WorkSession {
  return {
    id: Number(row.id),
    organizationId: String(row.organization_id),
    kind: row.kind as SessionKind,
    scanType: (row.scan_type as ScanSessionType | null) ?? null,
    armed: row.armed === true,
    surfaceKey: (row.surface_key as string | null) ?? null,
    status: row.status as SessionStatus,
    version: Number(row.version ?? 0),
    staffId: row.staff_id == null ? null : Number(row.staff_id),
    claimedByStaffId: row.claimed_by_staff_id == null ? null : Number(row.claimed_by_staff_id),
    claimExpiresAt: row.claim_expires_at == null ? null : String(row.claim_expires_at),
    deviceId: (row.device_id as string | null) ?? null,
    clientEventId: String(row.client_event_id),
    startedAt: String(row.started_at),
    endedAt: row.ended_at == null ? null : String(row.ended_at),
    state: (row.state as Record<string, unknown>) ?? {},
    title: (row.title as string | null) ?? null,
    purposeId: row.purpose_id == null ? null : Number(row.purpose_id),
    notes: (row.notes as string | null) ?? null,
    wrapUp: (row.wrap_up as string | null) ?? null,
    wrapUpSource: (row.wrap_up_source as WorkSession['wrapUpSource']) ?? null,
  };
}

function sqlTx(db: SessionQueryable, orgId: OrgId): WorkSessionTx {
  return {
    ensureSystemPurposes: () => ensureSystemPurposes(db as PurposeQueryable, orgId),
    purposeByKey: async (key) => {
      const { rows } = await db.query(
        `SELECT id, organization_id, key, label, default_surface_key, default_kind,
                is_system, sort_order, archived_at
           FROM work_session_purposes
          WHERE organization_id = $1 AND key = $2
          LIMIT 1`,
        [orgId, key],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return row ? mapPurpose(row) : null;
    },
    listLiveScanForStaff: async (staffId) => {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS} FROM work_sessions
          WHERE organization_id = $1 AND staff_id = $2 AND kind = 'scan'
            AND status IN ('open', 'parked')
          ORDER BY started_at DESC`,
        [orgId, staffId],
      );
      return (rows as Array<Record<string, unknown>>).map(mapSession);
    },
    getById: async (id) => {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS} FROM work_sessions
          WHERE organization_id = $1 AND id = $2`,
        [orgId, id],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return row ? mapSession(row) : null;
    },
    insertSession: async (row) => {
      const { rows } = await db.query(
        `INSERT INTO work_sessions (
           organization_id, kind, scan_type, armed, surface_key, status,
           staff_id, client_event_id, title, purpose_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10)
         RETURNING ${SESSION_COLUMNS}`,
        [
          orgId,
          row.kind,
          row.scanType,
          row.armed,
          row.surfaceKey,
          row.status,
          row.staffId,
          row.clientEventId,
          row.title,
          row.purposeId,
        ],
      );
      return mapSession(rows[0] as Record<string, unknown>);
    },
    patchSession: async (id, patch) => {
      const { rows } = await db.query(
        `UPDATE work_sessions SET
           status = COALESCE($3, status),
           armed = COALESCE($4, armed),
           surface_key = COALESCE($5, surface_key),
           ended_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE ended_at END,
           version = version + 1,
           updated_at = now()
         WHERE organization_id = $1 AND id = $2
         RETURNING ${SESSION_COLUMNS}`,
        [
          orgId,
          id,
          patch.status ?? null,
          patch.armed ?? null,
          patch.surfaceKey === undefined ? null : patch.surfaceKey,
          patch.endedAt !== undefined,
          patch.endedAt ?? null,
        ],
      );
      const mapped = rows[0] as Record<string, unknown> | undefined;
      if (!mapped) {
        throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });
      }
      return mapSession(mapped);
    },
    disarmStaffScan: async (staffId) => {
      await db.query(
        `UPDATE work_sessions
            SET armed = false, updated_at = now()
          WHERE organization_id = $1 AND staff_id = $2 AND kind = 'scan' AND armed`,
        [orgId, staffId],
      );
    },
    closeOpenInterval: async (sessionId, endedAt) => {
      await db.query(
        `UPDATE work_session_intervals
            SET ended_at = $3
          WHERE organization_id = $1 AND session_id = $2 AND ended_at IS NULL`,
        [orgId, sessionId, endedAt.toISOString()],
      );
    },
    insertInterval: async (row) => {
      await db.query(
        `INSERT INTO work_session_intervals
           (organization_id, session_id, kind, started_at, staff_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, row.sessionId, row.kind, row.startedAt.toISOString(), row.staffId],
      );
    },
    listActiveIntervalsForStaffWindow: async (staffId, windowStart, windowEnd) => {
      const { rows } = await db.query(
        `SELECT session_id, started_at, ended_at
           FROM work_session_intervals
          WHERE organization_id = $1 AND staff_id = $2 AND kind = 'active'
            AND started_at < $4
            AND (ended_at IS NULL OR ended_at > $3)`,
        [orgId, staffId, windowStart.toISOString(), windowEnd.toISOString()],
      );
      return (rows as Array<Record<string, unknown>>).map((r) => ({
        sessionId: Number(r.session_id),
        startedAt: String(r.started_at),
        endedAt: r.ended_at == null ? null : String(r.ended_at),
      }));
    },
    listRecentForStaff: async (staffId, limit) => {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS} FROM work_sessions
          WHERE organization_id = $1 AND staff_id = $2
          ORDER BY started_at DESC
          LIMIT $3`,
        [orgId, staffId, limit],
      );
      const sessions = (rows as Array<Record<string, unknown>>).map(mapSession);
      // The Stack folds elapsed from SUM(intervals), never wall time — a block
      // parked at 10:00 and resumed at 14:00 carries the work, not the gap.
      // One extra query per read, additive field; plain row reads stay one.
      const ids = sessions.map((s) => s.id);
      const intervals = ids.length
        ? await db.query(
            `SELECT session_id, started_at, ended_at FROM work_session_intervals
              WHERE organization_id = $1 AND session_id = ANY($2::int[])
              ORDER BY started_at ASC`,
            [orgId, ids],
          ).then((r) => r.rows as Array<Record<string, unknown>>)
        : [];
      const bySession = new Map<number, { startedAt: string; endedAt: string | null }[]>();
      for (const iv of intervals) {
        const sid = Number(iv.session_id);
        const list = bySession.get(sid) ?? [];
        list.push({
          startedAt: String(iv.started_at),
          endedAt: iv.ended_at == null ? null : String(iv.ended_at),
        });
        bySession.set(sid, list);
      }
      return sessions.map((s) => ({ ...s, intervals: bySession.get(s.id) ?? [] }));
    },
  };
}

export const defaultWorkSessionDeps: WorkSessionDeps = {
  now: () => new Date(),
  newClientEventId: () => randomUUID(),
  withTenantTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, (client) => fn(sqlTx(client, orgId)));
  },
};

function asLive(sessions: WorkSession[]): LiveScanSession[] {
  const out: LiveScanSession[] = [];
  for (const s of sessions) {
    if (s.kind !== 'scan' || s.scanType == null) continue;
    if (s.status !== 'open' && s.status !== 'parked') continue;
    out.push({
      id: s.id,
      scanType: s.scanType,
      status: s.status,
      startedAt: s.startedAt,
    });
  }
  return out;
}

async function parkSession(
  tx: WorkSessionTx,
  session: WorkSession,
  staffId: number,
  now: Date,
): Promise<WorkSession> {
  if (session.status !== 'open') return session;
  await tx.closeOpenInterval(session.id, now);
  await tx.insertInterval({ sessionId: session.id, kind: 'parked', staffId, startedAt: now });
  return tx.patchSession(session.id, { status: 'parked', armed: false });
}

async function resumeSession(
  tx: WorkSessionTx,
  session: WorkSession,
  staffId: number,
  now: Date,
  surfaceKey: string | null,
): Promise<WorkSession> {
  await tx.disarmStaffScan(staffId);
  await tx.closeOpenInterval(session.id, now);
  await tx.insertInterval({ sessionId: session.id, kind: 'active', staffId, startedAt: now });
  return tx.patchSession(session.id, {
    status: 'open',
    armed: session.kind === 'scan',
    surfaceKey: surfaceKey ?? session.surfaceKey,
  });
}

export type SyncScanAction = 'idle' | 'parked' | 'held' | 'resumed' | 'started';

export type SyncScanResult = SessionResult<{
  action: SyncScanAction;
  session: WorkSession | null;
  todayActiveMs: number;
}>;

export async function syncScanSurface(
  args: {
    orgId: OrgId;
    staffId: number;
    scanType: ScanSessionType | null;
    surfaceKey?: string | null;
  },
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<SyncScanResult> {
  try {
    return await deps.withTenantTransaction(args.orgId, async (tx) => {
      await tx.ensureSystemPurposes();
      const live = await tx.listLiveScanForStaff(args.staffId);
      const plan = planScanSync(asLive(live), args.scanType);
      const now = deps.now();
      const byId = new Map(live.map((s) => [s.id, s]));

      const parkListed = async (ids: number[]) => {
        for (const id of ids) {
          const row = byId.get(id);
          if (row) {
            const parked = await parkSession(tx, row, args.staffId, now);
            byId.set(id, parked);
          }
        }
      };

      let action: SyncScanAction = 'idle';
      let current: WorkSession | null = null;

      if (plan.type === 'idle') {
        action = 'idle';
        current = null;
      } else if (plan.type === 'park-floor') {
        await parkListed(plan.parkIds);
        await tx.disarmStaffScan(args.staffId);
        current = plan.currentId != null ? (await tx.getById(plan.currentId)) : null;
        action = plan.parkIds.length > 0 ? 'parked' : 'idle';
      } else if (plan.type === 'hold') {
        await parkListed(plan.parkIds);
        await tx.disarmStaffScan(args.staffId);
        current = await tx.patchSession(plan.sessionId, {
          status: 'open',
          armed: true,
          surfaceKey: args.surfaceKey ?? undefined,
        });
        action = 'held';
      } else if (plan.type === 'resume') {
        await parkListed(plan.parkIds);
        const row = byId.get(plan.sessionId) ?? (await tx.getById(plan.sessionId));
        if (!row) {
          return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
        }
        current = await resumeSession(tx, row, args.staffId, now, args.surfaceKey ?? null);
        action = 'resumed';
      } else {
        if (!args.scanType) {
          return { ok: false, status: 400, error: 'SCAN_TYPE_REQUIRED' };
        }
        await parkListed(plan.parkIds);
        await tx.disarmStaffScan(args.staffId);
        const purpose = await tx.purposeByKey(args.scanType);
        current = await tx.insertSession({
          kind: 'scan',
          scanType: args.scanType,
          armed: true,
          surfaceKey: args.surfaceKey ?? args.scanType,
          status: 'open',
          staffId: args.staffId,
          clientEventId: deps.newClientEventId(),
          title: purpose?.label ?? args.scanType,
          purposeId: purpose?.id ?? null,
        });
        await tx.insertInterval({
          sessionId: current.id,
          kind: 'active',
          staffId: args.staffId,
          startedAt: now,
        });
        action = 'started';
      }

      const todayActiveMs = await staffDayActiveMs(tx, args.staffId, now);
      return { ok: true, status: 200, action, session: current, todayActiveMs };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return { ok: false, status: 400, error: 'SESSIONS_TABLE_MISSING' };
    }
    throw err;
  }
}

async function staffDayActiveMs(tx: WorkSessionTx, staffId: number, now: Date): Promise<number> {
  const iso = now.toISOString().slice(0, 10);
  const { start, end } = utcDayWindow(iso, now);
  const rows = await tx.listActiveIntervalsForStaffWindow(staffId, start, end);
  const nowMs = now.getTime();
  return rows.reduce(
    (sum, row) =>
      sum +
      clipActiveMs({
        startedAt: Date.parse(row.startedAt),
        endedAt: row.endedAt ? Date.parse(row.endedAt) : null,
        windowStart: start.getTime(),
        windowEnd: end.getTime(),
        now: nowMs,
      }),
    0,
  );
}

export async function staffDailyReport(
  args: { orgId: OrgId; staffId: number; date?: string },
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<SessionResult<{ date: string; staffId: number; totalActiveMs: number }>> {
  try {
    return await deps.withTenantTransaction(args.orgId, async (tx) => {
      const now = deps.now();
      const date = args.date ?? now.toISOString().slice(0, 10);
      const { start, end } = utcDayWindow(date, now);
      const rows = await tx.listActiveIntervalsForStaffWindow(args.staffId, start, end);
      const nowMs = now.getTime();
      const totalActiveMs = rows.reduce(
        (sum, row) =>
          sum +
          clipActiveMs({
            startedAt: Date.parse(row.startedAt),
            endedAt: row.endedAt ? Date.parse(row.endedAt) : null,
            windowStart: start.getTime(),
            windowEnd: end.getTime(),
            now: nowMs,
          }),
        0,
      );
      return { ok: true, status: 200, date, staffId: args.staffId, totalActiveMs };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return { ok: false, status: 400, error: 'SESSIONS_TABLE_MISSING' };
    }
    throw err;
  }
}

export async function listRecentSessions(
  args: { orgId: OrgId; staffId: number; limit?: number },
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<SessionResult<{ sessions: WorkSession[] }>> {
  try {
    return await deps.withTenantTransaction(args.orgId, async (tx) => {
      const sessions = await tx.listRecentForStaff(args.staffId, args.limit ?? 12);
      return { ok: true, status: 200, sessions };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return { ok: false, status: 400, error: 'SESSIONS_TABLE_MISSING' };
    }
    throw err;
  }
}
