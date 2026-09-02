import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ScanSessionType, WorkSession } from './types';
import {
  syncScanSurface,
  type InsertIntervalInput,
  type InsertSessionInput,
  type SessionPatch,
  type WorkSessionDeps,
  type WorkSessionTx,
} from './work-sessions';

const ORG = '00000000-0000-0000-0000-000000000001';
const STAFF = 7;

function session(partial: Partial<WorkSession> & Pick<WorkSession, 'id' | 'scanType' | 'status'>): WorkSession {
  return {
    organizationId: ORG,
    kind: 'scan',
    armed: partial.status === 'open',
    surfaceKey: partial.scanType,
    version: 1,
    staffId: STAFF,
    claimedByStaffId: null,
    claimExpiresAt: null,
    deviceId: null,
    clientEventId: `evt-${partial.id}`,
    startedAt: '2026-09-01T10:00:00.000Z',
    endedAt: null,
    state: {},
    title: partial.scanType,
    purposeId: 1,
    notes: null,
    wrapUp: null,
    wrapUpSource: null,
    ...partial,
  };
}

interface Cap {
  parked: number[];
  resumed: number[];
  inserted: InsertSessionInput[];
  intervals: InsertIntervalInput[];
  disarmed: number;
}

function fakes(live: WorkSession[]) {
  const cap: Cap = { parked: [], resumed: [], inserted: [], intervals: [], disarmed: 0 };
  let nextId = 100;
  const rows = new Map(live.map((s) => [s.id, s]));

  const tx: WorkSessionTx = {
    ensureSystemPurposes: async () => {},
    purposeByKey: async (key) => ({
      id: 1,
      organizationId: ORG,
      key,
      label: key[0]!.toUpperCase() + key.slice(1),
      defaultSurfaceKey: key,
      defaultKind: 'scan',
      isSystem: true,
      sortOrder: 10,
      archivedAt: null,
    }),
    listLiveScanForStaff: async () => [...rows.values()].filter((s) => s.status !== 'ended'),
    getById: async (id) => rows.get(id) ?? null,
    insertSession: async (row: InsertSessionInput) => {
      cap.inserted.push(row);
      const created = session({
        id: nextId++,
        scanType: row.scanType as ScanSessionType,
        status: row.status,
        armed: row.armed,
        surfaceKey: row.surfaceKey,
        title: row.title,
        purposeId: row.purposeId,
        clientEventId: row.clientEventId,
      });
      rows.set(created.id, created);
      return created;
    },
    patchSession: async (id, patch: SessionPatch) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('SESSION_NOT_FOUND');
      if (patch.status === 'parked') cap.parked.push(id);
      if (patch.status === 'open' && cur.status === 'parked') cap.resumed.push(id);
      const next = {
        ...cur,
        status: patch.status ?? cur.status,
        armed: patch.armed ?? cur.armed,
        surfaceKey: patch.surfaceKey === undefined ? cur.surfaceKey : patch.surfaceKey,
      };
      rows.set(id, next);
      return next;
    },
    disarmStaffScan: async () => {
      cap.disarmed += 1;
      for (const [id, row] of rows) {
        if (row.armed) rows.set(id, { ...row, armed: false });
      }
    },
    closeOpenInterval: async () => {},
    insertInterval: async (row) => {
      cap.intervals.push(row);
    },
    listActiveIntervalsForStaffWindow: async () => [],
    listRecentForStaff: async () => [...rows.values()],
  };

  const deps: WorkSessionDeps = {
    now: () => new Date('2026-09-01T12:00:00.000Z'),
    newClientEventId: () => '11111111-1111-4111-8111-111111111111',
    withTenantTransaction: async (_orgId, fn) => fn(tx),
  };

  return { deps, cap, rows };
}

test('syncScanSurface: first visit to Unbox starts and arms', async () => {
  const { deps, cap } = fakes([]);
  const out = await syncScanSurface({ orgId: ORG, staffId: STAFF, scanType: 'unbox', surfaceKey: 'unbox' }, deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.action, 'started');
  assert.equal(out.session?.scanType, 'unbox');
  assert.equal(out.session?.armed, true);
  assert.equal(cap.inserted.length, 1);
  assert.equal(cap.inserted[0]?.staffId, STAFF);
  assert.equal(cap.inserted[0]?.scanType, 'unbox');
  assert.equal(cap.intervals[0]?.kind, 'active');
});

test('syncScanSurface: Unbox → Pack parks Unbox then starts Pack', async () => {
  const { deps, cap } = fakes([session({ id: 1, scanType: 'unbox', status: 'open', armed: true })]);
  const out = await syncScanSurface({ orgId: ORG, staffId: STAFF, scanType: 'pack', surfaceKey: 'pack' }, deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.action, 'started');
  assert.deepEqual(cap.parked, [1]);
  assert.equal(out.session?.scanType, 'pack');
  assert.ok(cap.disarmed >= 1);
});

test('syncScanSurface: back to Unbox resumes the parked row', async () => {
  const { deps, cap } = fakes([
    session({ id: 1, scanType: 'unbox', status: 'parked', armed: false }),
    session({ id: 2, scanType: 'pack', status: 'open', armed: true, startedAt: '2026-09-01T11:00:00.000Z' }),
  ]);
  const out = await syncScanSurface({ orgId: ORG, staffId: STAFF, scanType: 'unbox', surfaceKey: 'unbox' }, deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.action, 'resumed');
  assert.equal(out.session?.id, 1);
  assert.equal(out.session?.status, 'open');
  assert.deepEqual(cap.parked, [2]);
  assert.deepEqual(cap.resumed, [1]);
});

test('syncScanSurface: desk hop parks the open scan session', async () => {
  const { deps, cap } = fakes([session({ id: 1, scanType: 'unbox', status: 'open', armed: true })]);
  const out = await syncScanSurface({ orgId: ORG, staffId: STAFF, scanType: null }, deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.action, 'parked');
  assert.equal(out.session?.status, 'parked');
  assert.deepEqual(cap.parked, [1]);
});

test('syncScanSurface: org id is the transaction key, never a default', async () => {
  let seen: string | null = null;
  const { deps } = fakes([]);
  const wrapped: WorkSessionDeps = {
    ...deps,
    withTenantTransaction: async (orgId, fn) => {
      seen = orgId;
      return deps.withTenantTransaction(orgId, fn);
    },
  };
  await syncScanSurface({ orgId: ORG, staffId: STAFF, scanType: 'unbox' }, wrapped);
  assert.equal(seen, ORG);
});
