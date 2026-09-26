/** DB-free unit tests for the carton street writers (receiving_triage / receiving_unbox upserts). */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { upsertReceivingTriage, upsertReceivingUnbox } from './carton-street-write';

const ORG = '00000000-0000-0000-0000-000000000001';
const RID = 42;

function fakeClient() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pick<PoolClient, 'query'>;
  return { client, calls };
}

// ── receiving_triage ──────────────────────────────────────────────────────────

test('triage: door stamps are COALESCE-once (first stamp wins)', async () => {
  const { client, calls } = fakeClient();
  const at = new Date('2026-07-11T10:00:00.000Z');
  await upsertReceivingTriage(client, ORG, RID, { doorReceivedAt: at, doorReceivedBy: 7 });

  assert.equal(calls.length, 1, 'single-statement upsert');
  const { sql, params } = calls[0];
  assert.match(sql, /INSERT INTO receiving_triage/);
  assert.ok(sql.includes('door_received_at = COALESCE(receiving_triage.door_received_at, EXCLUDED.door_received_at)'));
  assert.ok(sql.includes('door_received_by = COALESCE(receiving_triage.door_received_by, EXCLUDED.door_received_by)'));
  // Never a blind overwrite of a stamp.
  assert.ok(!sql.includes('door_received_at = EXCLUDED.door_received_at,'));
  assert.equal(params[0], RID);
  assert.equal(params[1], ORG);
  assert.ok(params.includes(at));
  assert.ok(params.includes(7));
});

test('triage: staging/lane/pairing/triage_* overwrite when present (incl. null clears)', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, {
    stagingLocationId: 5,
    priorityLane: null,
    pairingState: 'MATCHED',
    triageComplete: true,
    triageCompletedAt: 'now',
    triageCompletedBy: 3,
    triageClientEventId: 'evt-1',
  });

  const { sql, params } = calls[0];
  assert.ok(sql.includes('staging_location_id = EXCLUDED.staging_location_id'));
  assert.ok(sql.includes('priority_lane = EXCLUDED.priority_lane'));
  assert.ok(sql.includes('pairing_state = EXCLUDED.pairing_state'));
  assert.ok(sql.includes('triage_complete = EXCLUDED.triage_complete'));
  assert.ok(sql.includes('triage_completed_at = EXCLUDED.triage_completed_at'));
  assert.ok(sql.includes('triage_completed_by = EXCLUDED.triage_completed_by'));
  assert.ok(sql.includes('triage_client_event_id = EXCLUDED.triage_client_event_id'));
  // A null lane is a real overwrite (clear), bound as a parameter.
  assert.ok(params.includes(null));
  assert.ok(params.includes('evt-1'));
});

test("triage: 'now' renders as SQL NOW(), not a bound parameter", async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, { triageCompletedAt: 'now', triageCompletedBy: 3 });

  const { sql, params } = calls[0];
  // VALUES carries NOW() for the timestamp; 'now' never appears as a param.
  assert.match(sql, /VALUES \(\$1, \$2::uuid, NOW\(\), \$3, NOW\(\)\)/);
  assert.ok(!params.includes('now'));
});

test('triage: omitted fields are never clobbered (SET list from provided keys only)', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, { stagingLocationId: 9 });

  const { sql, params } = calls[0];
  assert.ok(sql.includes('staging_location_id = EXCLUDED.staging_location_id'));
  for (const absent of [
    'door_received_at',
    'door_received_by',
    'priority_lane',
    'pairing_state',
    'triage_completed_at',
    'triage_completed_by',
    'triage_client_event_id',
  ]) {
    assert.ok(!sql.includes(absent), `${absent} must be absent`);
  }
  // triage_complete omitted too (triage_completed_* already asserted above).
  assert.ok(!/\btriage_complete\s*=/.test(sql));
  assert.deepEqual(params, [RID, ORG, 9]);
});

test('triage: updated_at always bumped; org led explicitly', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, {});

  const { sql, params } = calls[0];
  assert.ok(sql.includes('organization_id'));
  assert.ok(sql.includes('updated_at = NOW()'));
  assert.match(sql, /INSERT INTO receiving_triage \(receiving_id, organization_id, updated_at\)/);
  assert.deepEqual(params, [RID, ORG]);
});

// ── receiving_unbox ───────────────────────────────────────────────────────────

test('unbox: opened/unboxed stamps are COALESCE-once', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingUnbox(client, ORG, RID, {
    openedAt: 'now',
    openedBy: 2,
    unboxedAt: 'now',
    unboxedBy: 4,
  });

  const { sql } = calls[0];
  assert.ok(sql.includes('opened_at = COALESCE(receiving_unbox.opened_at, EXCLUDED.opened_at)'));
  assert.ok(sql.includes('opened_by = COALESCE(receiving_unbox.opened_by, EXCLUDED.opened_by)'));
  assert.ok(sql.includes('unboxed_at = COALESCE(receiving_unbox.unboxed_at, EXCLUDED.unboxed_at)'));
  assert.ok(sql.includes('unboxed_by = COALESCE(receiving_unbox.unboxed_by, EXCLUDED.unboxed_by)'));
  assert.ok(sql.includes('updated_at = NOW()'));
});

test('unbox: deriveIntakePath encodes all three branches in one statement', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingUnbox(client, ORG, RID, { openedAt: 'now', deriveIntakePath: true });

  assert.equal(calls.length, 1, 'derivation is in-statement, not a separate read');
  const { sql, params } = calls[0];
  // Branch 1 — already resolved: keep the existing path.
  assert.ok(sql.includes("WHEN receiving_unbox.intake_path IN ('unbox_only', 'triage_first') THEN receiving_unbox.intake_path"));
  // Branch 2 + 3 — unresolved: derive from the triage door stamp
  // (no door_received_at → 'unbox_only'; door stamped → 'triage_first').
  assert.ok(sql.includes('SELECT 1 FROM receiving_triage rt'));
  assert.ok(sql.includes('rt.door_received_at IS NOT NULL'));
  assert.ok(sql.includes("THEN 'triage_first' ELSE 'unbox_only' END"));
  // The derived value also lands on first INSERT (fresh street row).
  assert.match(sql, /VALUES \(\$1, \$2::uuid, NOW\(\), \(CASE WHEN EXISTS/);
  // The derive subquery is org-scoped via the explicit params.
  assert.ok(sql.includes('rt.organization_id = $2::uuid'));
  assert.deepEqual(params, [RID, ORG]);
});

test('unbox: without deriveIntakePath the intake_path column is untouched', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingUnbox(client, ORG, RID, { unboxedAt: 'now', unboxedBy: 8 });

  const { sql } = calls[0];
  assert.ok(!sql.includes('intake_path'), 'intake_path must be absent');
  assert.ok(!sql.includes('opened_at'), 'omitted opened_at must be absent');
});

test('triage: preserveMatchedPairing never downgrades a real PO match', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, {
    pairingState: 'WAIVED',
    preserveMatchedPairing: true,
  });
  const { sql } = calls[0];
  // The SET keeps MATCHED and applies the new value to every other state — a
  // background "nothing to pair to" writer must not un-match a matched carton.
  assert.match(sql, /CASE WHEN receiving_triage\.pairing_state = 'MATCHED'/);
  assert.match(sql, /ELSE EXCLUDED\.pairing_state END/);
});

test('triage: without the flag pairing still OVERWRITES', async () => {
  const { client, calls } = fakeClient();
  await upsertReceivingTriage(client, ORG, RID, { pairingState: 'MATCHED' });
  const { sql } = calls[0];
  assert.match(sql, /pairing_state = EXCLUDED\.pairing_state/);
  assert.doesNotMatch(sql, /CASE WHEN/);
});
