/**
 * DB-free unit tests for completeTriage — the save-for-unbox transition after
 * the Wave-3 writer inversion. A fake TxClient dispatches on SQL shape so we
 * can prove, without a database:
 *   - replay: a known triage_client_event_id short-circuits (street-keyed)
 *   - 404 vs 422: missing carton vs carton not staged (shelf+lane on rt)
 *   - the completion stamp goes to receiving_triage (never the spine)
 *   - the triage-outcome signal fires only on the FIRST completion
 */

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTriage, type CompleteTriageDeps, type TxClient } from './complete-triage';

const ORG = '00000000-0000-0000-0000-000000000001';

interface FakeState {
  /** Row returned for the replay lookup (by triage_client_event_id). */
  replayRow?: { id: number; triage_completed_at: string } | null;
  /** Row returned for the rt FOR UPDATE lock (readiness gate + prior state). */
  rtRow?: {
    staging_location_id: number | null;
    priority_lane: string | null;
    triage_complete: boolean;
  } | null;
  /** Whether the carton spine row exists (404 vs 422 fork). */
  cartonExists?: boolean;
  /** The stamped time read back after the upsert. */
  stampedAt?: string;
}

function makeDeps(state: FakeState) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const signals: Array<Record<string, unknown>> = [];

  const client: TxClient = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('rt.triage_client_event_id = $2')) {
        const row = state.replayRow;
        return { rows: row ? [row as unknown as Record<string, unknown>] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('FOR UPDATE')) {
        const row = state.rtRow;
        return { rows: row ? [row as unknown as Record<string, unknown>] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('FROM receiving_carton')) {
        return { rows: state.cartonExists ? [{ '?column?': 1 }] : [], rowCount: state.cartonExists ? 1 : 0 };
      }
      if (sql.includes('INSERT INTO receiving_triage')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('triage_completed_at::text')) {
        return { rows: [{ triage_completed_at: state.stampedAt ?? '2026-07-11 12:00:00+00' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const deps: CompleteTriageDeps = {
    runTx: async (_org, fn) => fn(client),
    emitSignal: (async (args: Record<string, unknown>) => {
      signals.push(args);
    }) as unknown as CompleteTriageDeps['emitSignal'],
  };

  return { deps, calls, signals };
}

const READY_RT = { staging_location_id: 4, priority_lane: 'RED', triage_complete: false };

test('replay: a known client_event_id resolves off the street row, no re-stamp', async () => {
  const { deps, calls, signals } = makeDeps({
    replayRow: { id: 11, triage_completed_at: '2026-07-10 09:00:00+00' },
  });

  const res = await completeTriage({ receivingId: 11, staffId: 3, clientEventId: 'evt-1' }, ORG, deps);

  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.idempotent, true);
  assert.equal(res.receivingId, 11);
  assert.equal(res.triageCompletedAt, '2026-07-10 09:00:00+00');
  // Replay never writes and never re-emits.
  assert.ok(!calls.some((c) => c.sql.includes('INSERT INTO receiving_triage')));
  assert.equal(signals.length, 0);
});

test('404: no street row and no carton', async () => {
  const { deps } = makeDeps({ rtRow: null, cartonExists: false });

  const res = await completeTriage({ receivingId: 12, staffId: 3 }, ORG, deps);

  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  assert.equal(res.error, 'carton not found');
});

test('422: carton exists but shelf/lane not staged on the street row', async () => {
  for (const rtRow of [
    null, // never staged → no rt row at all
    { staging_location_id: null, priority_lane: 'RED', triage_complete: false },
    { staging_location_id: 4, priority_lane: null, triage_complete: false },
  ]) {
    const { deps, calls } = makeDeps({ rtRow, cartonExists: true });
    const res = await completeTriage({ receivingId: 13, staffId: 3 }, ORG, deps);
    assert.equal(res.status, 422);
    assert.match(res.error ?? '', /shelf and a priority lane/);
    assert.ok(!calls.some((c) => c.sql.includes('INSERT INTO receiving_triage')));
  }
});

test('first completion: stamps the STREET table and emits the signal once', async () => {
  const { deps, calls, signals } = makeDeps({
    rtRow: READY_RT,
    stampedAt: '2026-07-11 12:34:56+00',
  });

  const res = await completeTriage({ receivingId: 14, staffId: 9, clientEventId: 'evt-2' }, ORG, deps);

  assert.equal(res.ok, true);
  assert.equal(res.idempotent, false);
  assert.equal(res.triageCompletedAt, '2026-07-11 12:34:56+00');

  const upsert = calls.find((c) => c.sql.includes('INSERT INTO receiving_triage'));
  assert.ok(upsert, 'completion is written via the street upsert');
  assert.ok(upsert.sql.includes('triage_complete = EXCLUDED.triage_complete'));
  assert.ok(upsert.sql.includes('triage_completed_by = EXCLUDED.triage_completed_by'));
  assert.ok(upsert.sql.includes('triage_client_event_id = EXCLUDED.triage_client_event_id'));
  // completed_at rides as SQL NOW(), and the actor + replay key as params.
  assert.match(upsert.sql, /NOW\(\)/);
  assert.ok(upsert.params.includes(9));
  assert.ok(upsert.params.includes('evt-2'));
  // No spine write of the moved columns.
  assert.ok(!calls.some((c) => c.sql.includes('UPDATE receiving_carton')));

  assert.equal(signals.length, 1);
  assert.equal(signals[0].entityId, 14);
  assert.equal(signals[0].signalKind, 'triage_outcome');
});

test('re-click without client_event_id: re-stamps but never re-emits; key not clobbered', async () => {
  const { deps, calls, signals } = makeDeps({
    rtRow: { ...READY_RT, triage_complete: true },
  });

  const res = await completeTriage({ receivingId: 15, staffId: 9 }, ORG, deps);

  assert.equal(res.ok, true);
  assert.equal(res.idempotent, false);
  const upsert = calls.find((c) => c.sql.includes('INSERT INTO receiving_triage'));
  assert.ok(upsert);
  // No clientEventId sent → the replay-key column is OMITTED (never clobbered).
  assert.ok(!upsert.sql.includes('triage_client_event_id'));
  // Prior completion → no second triage_outcome signal.
  assert.equal(signals.length, 0);
});
