import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scanSurfaceForLocation } from './scan-session-surface';
import {
  clipActiveMs,
  formatCompactDuration,
  planScanSync,
  type LiveScanSession,
} from './scan-session-sync';

const unbox: LiveScanSession = {
  id: 1,
  scanType: 'unbox',
  status: 'open',
  startedAt: '2026-09-01T10:00:00.000Z',
};
const packParked: LiveScanSession = {
  id: 2,
  scanType: 'pack',
  status: 'parked',
  startedAt: '2026-09-01T09:00:00.000Z',
};

test('scanSurfaceForLocation: floor benches map to scan types', () => {
  assert.deepEqual(scanSurfaceForLocation('/unbox'), { scanType: 'unbox', surfaceKey: 'unbox' });
  assert.deepEqual(scanSurfaceForLocation('/pack'), { scanType: 'pack', surfaceKey: 'pack' });
  assert.deepEqual(scanSurfaceForLocation('/shipping/scan-out'), {
    scanType: 'outbound',
    surfaceKey: 'outbound',
  });
  assert.deepEqual(scanSurfaceForLocation('/test'), { scanType: 'test', surfaceKey: 'test' });
  assert.equal(scanSurfaceForLocation('/repair'), null);
  assert.equal(scanSurfaceForLocation('/incoming'), null);
  assert.deepEqual(
    scanSurfaceForLocation('/receiving', { get: (k) => (k === 'mode' ? 'triage' : null) }),
    { scanType: 'triage', surfaceKey: 'triage' },
  );
});

test('planScanSync: Unbox → Pack parks Unbox and starts Pack', () => {
  const plan = planScanSync([unbox], 'pack');
  assert.deepEqual(plan, { type: 'start', parkIds: [1] });
});

test('planScanSync: back to Unbox resumes the parked Unbox row', () => {
  const parkedUnbox: LiveScanSession = { ...unbox, status: 'parked' };
  const openPack: LiveScanSession = {
    id: 3,
    scanType: 'pack',
    status: 'open',
    startedAt: '2026-09-01T11:00:00.000Z',
  };
  const plan = planScanSync([parkedUnbox, openPack], 'unbox');
  assert.deepEqual(plan, { type: 'resume', sessionId: 1, parkIds: [3] });
});

test('planScanSync: same station is a hold and parks others', () => {
  const plan = planScanSync([unbox, packParked], 'unbox');
  assert.deepEqual(plan, { type: 'hold', sessionId: 1, parkIds: [] });
});

test('planScanSync: leaving the floor parks open sessions', () => {
  const plan = planScanSync([unbox, packParked], null);
  assert.deepEqual(plan, { type: 'park-floor', parkIds: [1], currentId: 1 });
});

test('clipActiveMs folds only the window overlap', () => {
  const windowStart = Date.parse('2026-09-01T00:00:00.000Z');
  const windowEnd = Date.parse('2026-09-02T00:00:00.000Z');
  const ms = clipActiveMs({
    startedAt: Date.parse('2026-08-31T23:00:00.000Z'),
    endedAt: Date.parse('2026-09-01T02:00:00.000Z'),
    windowStart,
    windowEnd,
    now: windowEnd,
  });
  assert.equal(ms, 2 * 60 * 60 * 1000);
});

test('formatCompactDuration', () => {
  assert.equal(formatCompactDuration(0), '0m');
  assert.equal(formatCompactDuration(90_000), '1m');
  assert.equal(formatCompactDuration(3_600_000 + 120_000), '1h 2m');
});
