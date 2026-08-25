/**
 * Scan ordering and burst coalescing — pure, no queue, no scheduler.
 *
 * The property under test is the one async attribution can silently break:
 * a burst of scans must report in the order the OPERATOR made them, not the
 * order the network happened to deliver.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coalesceSessionCounters,
  orderScanWrites,
  type ScanWrite,
} from './scan-write-order';

const T = (ms: number) => new Date(Date.parse('2026-08-22T09:00:00.000Z') + ms).toISOString();

function write(over: Partial<ScanWrite> & { clientEventId: string }): ScanWrite {
  return {
    occurredAt: T(0),
    sessionId: 1,
    sessionType: 'unbox',
    value: 'BARCODE',
    surfaceKey: 'unbox',
    deviceId: 'bench-3',
    ...over,
  };
}

test('out-of-order arrival still reports in SCAN order', () => {
  // Six scans fired ~40ms apart; the network delivered them scrambled.
  const scanned = [0, 40, 80, 120, 160, 200];
  const arrived = [80, 0, 200, 40, 160, 120];

  const pending = arrived.map((at) =>
    write({ clientEventId: `ce-${at}`, occurredAt: T(at), value: `SCAN-${at}` }),
  );

  const ordered = orderScanWrites(pending);
  assert.deepEqual(
    ordered.map((w) => w.value),
    scanned.map((at) => `SCAN-${at}`),
  );
});

test('ties break by clientEventId, and the sort is total', () => {
  // Two scans inside the same millisecond are ordinary on a fast wedge. An
  // unstable sort would render the same burst differently on two devices.
  const a = write({ clientEventId: 'aaa', occurredAt: T(10), value: 'A' });
  const b = write({ clientEventId: 'bbb', occurredAt: T(10), value: 'B' });
  const c = write({ clientEventId: 'ccc', occurredAt: T(10), value: 'C' });

  assert.deepEqual(orderScanWrites([c, a, b]).map((w) => w.value), ['A', 'B', 'C']);
  assert.deepEqual(orderScanWrites([b, c, a]).map((w) => w.value), ['A', 'B', 'C']);
});

test('ordering never falls back to arrival position or insertion id', () => {
  // The same set in two arrival orders must produce byte-identical output.
  const set = [200, 40, 160, 0, 120, 80].map((at) =>
    write({ clientEventId: `ce-${at}`, occurredAt: T(at) }),
  );
  const shuffled = [...set].reverse();
  assert.deepEqual(orderScanWrites(set), orderScanWrites(shuffled));
});

test('a replayed clientEventId collapses to ONE write, keeping the original', () => {
  const original = write({ clientEventId: 'dup', occurredAt: T(10), value: 'FIRST' });
  const retry = write({ clientEventId: 'dup', occurredAt: T(10), value: 'RETRY-METADATA' });

  const ordered = orderScanWrites([original, retry]);
  assert.equal(ordered.length, 1);
  assert.equal(ordered[0].value, 'FIRST', 'the retry does not overwrite the original');
});

test('a malformed timestamp sorts LAST rather than reordering everything', () => {
  const good = [0, 40, 80].map((at) => write({ clientEventId: `ce-${at}`, occurredAt: T(at) }));
  const bad = write({ clientEventId: 'ce-bad', occurredAt: 'not-a-date', value: 'BAD' });

  const ordered = orderScanWrites([bad, ...good]);
  assert.equal(ordered.length, 4, 'the bad write is kept, not dropped');
  assert.equal(ordered[3].value, 'BAD');
});

test('a burst of 50 scans folds into ONE counter delta, not 50', () => {
  const burst = Array.from({ length: 50 }, (_, i) =>
    write({ clientEventId: `ce-${i}`, occurredAt: T(i * 20), value: `UNIT-${i}` }),
  );

  const deltas = coalesceSessionCounters(burst);
  assert.equal(deltas.length, 1, 'one session, one update');
  assert.equal(deltas[0].scans, 50);
  assert.equal(deltas[0].lastValue, 'UNIT-49', 'the last scan the OPERATOR made');
  assert.equal(deltas[0].sessionType, 'unbox');
});

test('lastValue follows scan order, not arrival order', () => {
  const late = write({ clientEventId: 'a', occurredAt: T(900), value: 'ACTUALLY-LAST' });
  const early = write({ clientEventId: 'b', occurredAt: T(10), value: 'FIRST' });
  // `late` was minted last but arrived first.
  const [delta] = coalesceSessionCounters([late, early]);
  assert.equal(delta.lastValue, 'ACTUALLY-LAST');
});

test('two sessions on one device get one delta EACH, never a merged count', () => {
  const pending = [
    write({ clientEventId: 'a', sessionId: 1, sessionType: 'unbox', occurredAt: T(0) }),
    write({ clientEventId: 'b', sessionId: 2, sessionType: 'pack', occurredAt: T(10) }),
    write({ clientEventId: 'c', sessionId: 1, sessionType: 'unbox', occurredAt: T(20) }),
  ];

  const deltas = coalesceSessionCounters(pending);
  assert.deepEqual(
    deltas.map((d) => [d.sessionId, d.scans]),
    [[1, 2], [2, 1]],
  );
});

test('a replay does not inflate the operator-facing count', () => {
  const pending = [
    write({ clientEventId: 'a', occurredAt: T(0) }),
    write({ clientEventId: 'b', occurredAt: T(10) }),
    write({ clientEventId: 'a', occurredAt: T(0) }), // reconnect replayed it
  ];
  // The DB protects the data; this protects the number the operator watches.
  assert.equal(coalesceSessionCounters(pending)[0].scans, 2);
});
