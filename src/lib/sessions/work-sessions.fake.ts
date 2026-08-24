/**
 * In-memory `work_sessions` + `work_session_intervals` stand-in for DB-free
 * unit tests.
 *
 * NOT a general SQL engine and not trying to be. It pattern-matches the exact
 * statements ./work-sessions.ts issues and, crucially, ENFORCES THE TWO PARTIAL
 * UNIQUE INDEXES the real tables carry:
 *
 *   ux_work_sessions_armed_scan      → at most one armed scan session per org
 *   ux_work_session_intervals_open   → at most one open interval per session
 *
 * Both throw here exactly where Postgres would. That is the point of the fake:
 * a code path that tried to hold two armed sessions, or to open a stretch
 * without closing the last one, fails in a millisecond-fast unit test instead
 * of at 2am against a real index.
 *
 * Shared by work-sessions.test.ts and work-session-intervals.test.ts. It lives
 * in its own module rather than inside one of them because a `.test.ts` that
 * imports another `.test.ts` registers that file's tests twice.
 *
 * ── THE CLOCK IS EXPLICIT ───────────────────────────────────────────────────
 *
 * `now()` resolves to {@link WorkSessionFake.nowIso}, which only moves when a
 * test calls {@link WorkSessionFake.advance}. Durations are the thing under
 * test, so a real clock would make the assertions flaky by exactly the amount
 * the test takes to run.
 */

import type { SessionQueryable, WorkSessionDeps } from './work-sessions';

type Row = Record<string, unknown>;

export const FAKE_ORG = '00000000-0000-0000-0000-0000000000aa';
const EPOCH = Date.parse('2026-08-22T00:00:00.000Z');

export interface WorkSessionFake {
  deps: WorkSessionDeps;
  /** `work_sessions` rows, live. */
  rows: Row[];
  /** `work_session_intervals` rows, live and in insertion order. */
  intervals: Row[];
  /** `work_session_purposes` rows, live. */
  purposes: Row[];
  /** Every statement issued, in order — for assertions about ordering. */
  sql: string[];
  /** Move the fake clock forward. */
  advance: (ms: number) => void;
  nowIso: () => string;
  /** Make the NEXT arm lose to `winnerSessionId`, as a concurrent write would. */
  raceOnNextArm: (winnerSessionId: number) => void;
}

export function fakes(seed: Row[] = []): WorkSessionFake {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  const intervals: Row[] = [];
  const purposes: Row[] = [];
  const sql: string[] = [];
  let nextId = rows.reduce((max, r) => Math.max(max, Number(r.id)), 0) + 1;
  let nextIntervalId = 1;
  let nextPurposeId = 1;
  let clock = EPOCH;

  const nowIso = () => new Date(clock).toISOString();

  // ux_work_sessions_armed_scan, in JS. Runs after every session mutation.
  //
  // Throws a PG-SHAPED error (`code` + `constraint`), not a bare Error, because
  // the domain distinguishes THIS unique violation from every other one — a
  // lost arm race is a normal outcome, any other 23505 is a bug that must not
  // be swallowed. A fake that threw a generic Error would let a broken
  // discriminator pass.
  const assertOneArmed = () => {
    const armed = rows.filter((r) => r.kind === 'scan' && r.armed === true);
    if (armed.length > 1) {
      const err = new Error(
        `duplicate key value violates unique constraint "ux_work_sessions_armed_scan"`,
      ) as Error & { code?: string; constraint?: string };
      err.code = '23505';
      err.constraint = 'ux_work_sessions_armed_scan';
      throw err;
    }
  };

  /**
   * Simulate another device winning the arm between our disarm and our arm.
   *
   * That window is real and narrow: the swap is two statements, and a
   * concurrent transaction can commit an arm in between. Reproducing it needs a
   * hook, because nothing a single-threaded test does otherwise can interleave.
   */
  let raceArmerId: unknown = null;
  let lastArmTarget: unknown = null;
  const raceOnNextArm = (winnerSessionId: unknown) => {
    raceArmerId = winnerSessionId;
  };

  // ux_work_session_intervals_open, in JS. Runs after every interval mutation.
  const assertOneOpenInterval = (sessionId: unknown) => {
    const open = intervals.filter((i) => i.session_id === sessionId && i.ended_at === null);
    if (open.length > 1) {
      throw new Error(
        `ux_work_session_intervals_open violated: ${open.length} open intervals on session ${String(sessionId)}`,
      );
    }
  };

  const db: SessionQueryable = {
    async query(text, params = []) {
      sql.push(text);
      const p = params as unknown[];

      // Transaction-control statements the domain issues around the arm swap.
      // No-ops here: the fake has no aborted-transaction state to contain, and
      // the tests that care assert on `sql` ordering rather than on rollback.
      if (/^\s*(SAVEPOINT|RELEASE SAVEPOINT)\b/.test(text)) {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('INSERT INTO work_session_purposes')) {
        const custom = /false,\s*1000/.test(text);
        const orgId = p[0];
        const key = p[1];
        const label = p[2];
        const defaultKind = custom ? 'task' : p[3];
        const defaultSurfaceKey = custom ? null : p[4];
        const sortOrder = custom ? 1000 : p[5];
        const dupKey = purposes.find((r) => r.organization_id === orgId && r.key === key);
        if (dupKey) {
          if (text.includes('RETURNING')) return { rows: [{ ...dupKey }], rowCount: 0 };
          return { rows: [], rowCount: 0 };
        }
        const row: Row = {
          id: nextPurposeId++,
          organization_id: orgId,
          key,
          label,
          default_kind: defaultKind,
          default_surface_key: defaultSurfaceKey ?? null,
          is_system: !custom,
          sort_order: sortOrder ?? 1000,
          archived_at: null,
        };
        purposes.push(row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('UPDATE work_session_purposes')) {
        const [orgId, id] = p;
        const row = purposes.find((r) => r.organization_id === orgId && r.id === id);
        if (!row) return { rows: [], rowCount: 0 };
        row.archived_at = nowIso();
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('FROM work_session_purposes')) {
        const [orgId] = p;
        if (text.includes('lower(label)')) {
          const label = String(p[1] ?? '');
          const hit = purposes
            .filter(
              (r) =>
                r.organization_id === orgId && String(r.label).toLowerCase() === label.toLowerCase(),
            )
            .sort((a, b) => Number(a.id) - Number(b.id));
          const row = hit[0];
          return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
        }
        if (text.includes('AND id = $2')) {
          const id = p[1];
          const row = purposes.find((r) => r.organization_id === orgId && r.id === id);
          return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
        }
        if (text.includes('SELECT key FROM')) {
          return {
            rows: purposes.filter((r) => r.organization_id === orgId).map((r) => ({ key: r.key })),
            rowCount: purposes.length,
          };
        }
        const archived = !text.includes('archived_at IS NULL');
        const rows = purposes.filter(
          (r) => r.organization_id === orgId && (archived || r.archived_at == null),
        );
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }

      // ── work_session_intervals ──────────────────────────────────────────
      // Matched BEFORE the generic `FOR UPDATE` branch below: the open-interval
      // read is also a FOR UPDATE, and the looser pattern would swallow it.
      if (text.includes('FROM work_session_intervals')) {
        const [orgId, sessionId] = p;
        const open = intervals.find(
          (i) =>
            i.organization_id === orgId && i.session_id === sessionId && i.ended_at === null,
        );
        return { rows: open ? [{ ...open }] : [], rowCount: open ? 1 : 0 };
      }

      if (text.includes('UPDATE work_session_intervals')) {
        const [orgId, sessionId] = p;
        const open = intervals.filter(
          (i) =>
            i.organization_id === orgId && i.session_id === sessionId && i.ended_at === null,
        );
        for (const i of open) i.ended_at = nowIso();
        assertOneOpenInterval(sessionId);
        return { rows: [], rowCount: open.length };
      }

      if (text.includes('INSERT INTO work_session_intervals')) {
        const [orgId, sessionId, kind, staffId] = p;
        intervals.push({
          id: nextIntervalId++,
          organization_id: orgId,
          session_id: sessionId,
          kind,
          started_at: nowIso(),
          ended_at: null,
          staff_id: staffId ?? null,
        });
        assertOneOpenInterval(sessionId);
        return { rows: [], rowCount: 1 };
      }

      // ── work_sessions ───────────────────────────────────────────────────
      if (text.includes('INSERT INTO work_sessions')) {
        const [
          orgId,
          kind,
          scanType,
          surfaceKey,
          staffId,
          deviceId,
          clientEventId,
          state,
          title,
          purposeId,
          notes,
        ] = p;
        const dup = rows.find(
          (r) => r.organization_id === orgId && r.client_event_id === clientEventId,
        );
        if (dup) return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING
        const row: Row = {
          id: nextId++,
          organization_id: orgId,
          kind,
          scan_type: scanType,
          armed: false,
          surface_key: surfaceKey,
          status: 'open',
          version: 0,
          staff_id: staffId,
          claimed_by_staff_id: null,
          claim_expires_at: null,
          device_id: deviceId,
          client_event_id: clientEventId,
          started_at: nowIso(),
          ended_at: null,
          state: JSON.parse(String(state)),
          title: title ?? null,
          purpose_id: purposeId ?? null,
          notes: notes ?? null,
          wrap_up: null,
          wrap_up_source: null,
        };
        rows.push(row);
        assertOneArmed();
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('SET armed = false')) {
        const [orgId, exceptId] = p;
        const hit = rows.filter(
          (r) =>
            r.organization_id === orgId &&
            r.kind === 'scan' &&
            r.armed === true &&
            r.id !== exceptId,
        );
        for (const r of hit) {
          r.armed = false;
          r.version = Number(r.version) + 1;
        }
        assertOneArmed();
        return { rows: hit.map((r) => ({ id: r.id })), rowCount: hit.length };
      }

      if (text.includes('SET armed = true')) {
        const [orgId, id] = p;
        if (raceArmerId != null) {
          // The concurrent winner lands first. Our arm then violates the index,
          // exactly as Postgres would report it.
          const winner = rows.find((r) => r.organization_id === orgId && r.id === raceArmerId);
          raceArmerId = null;
          if (winner) winner.armed = true;
        }
        lastArmTarget = id;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id)!;
        row.armed = true;
        row.version = Number(row.version) + 1;
        assertOneArmed();
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('ROLLBACK TO SAVEPOINT')) {
        // Undo the losing arm the way a savepoint rollback would: our row never
        // got the flag, the winner keeps it.
        for (const r of rows) {
          if (r.kind === 'scan' && r.armed === true && r.id !== lastArmTarget) continue;
          if (r.id === lastArmTarget) r.armed = false;
        }
        return { rows: [], rowCount: 0 };
      }

      if (text.includes("SET status = 'parked'")) {
        const [orgId, id] = p;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id)!;
        row.status = 'parked';
        row.armed = false;
        row.version = Number(row.version) + 1;
        assertOneArmed();
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes("SET status = 'open'")) {
        const [orgId, id, staffId, , deviceId] = p;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id)!;
        row.status = 'open';
        row.claimed_by_staff_id = staffId;
        row.claim_expires_at = new Date(clock + 900_000).toISOString();
        row.device_id = deviceId ?? row.device_id;
        row.version = Number(row.version) + 1;
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes("SET status = 'ended'")) {
        const [orgId, id, wrapUp, wrapUpSource] = p;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id)!;
        row.status = 'ended';
        row.armed = false;
        row.ended_at = nowIso();
        row.claimed_by_staff_id = null;
        row.claim_expires_at = null;
        if (wrapUp != null) row.wrap_up = wrapUp;
        if (wrapUpSource != null) row.wrap_up_source = wrapUpSource;
        row.version = Number(row.version) + 1;
        assertOneArmed();
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('SET title = COALESCE')) {
        const [orgId, id, title, notes] = p;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id)!;
        if (title != null) row.title = title;
        if (notes != null) row.notes = notes;
        row.version = Number(row.version) + 1;
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (text.includes('armed = true')) {
        // getArmedScanSession, and armWithin's post-race "who won" re-read.
        const [orgId] = p;
        const hit = rows.filter(
          (r) => r.organization_id === orgId && r.kind === 'scan' && r.armed === true,
        );
        return { rows: hit.map((r) => ({ ...r })), rowCount: hit.length };
      }

      if (text.includes('client_event_id = $2')) {
        const [orgId, clientEventId] = p;
        const row = rows.find(
          (r) => r.organization_id === orgId && r.client_event_id === clientEventId,
        );
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }

      if (text.includes('FOR UPDATE') || (text.includes('FROM work_sessions') && text.includes('AND id = $2'))) {
        const [orgId, id] = p;
        const row = rows.find((r) => r.organization_id === orgId && r.id === id);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }

      throw new Error(`fake db: unhandled SQL\n${text}`);
    },
  };

  let uuid = 0;
  return {
    rows,
    intervals,
    purposes,
    sql,
    advance: (ms: number) => {
      clock += ms;
    },
    nowIso,
    raceOnNextArm,
    deps: {
      withTenantTransaction: (_orgId, fn) => fn(db),
      newClientEventId: () => `11111111-1111-1111-1111-${String(++uuid).padStart(12, '0')}`,
    },
  };
}
