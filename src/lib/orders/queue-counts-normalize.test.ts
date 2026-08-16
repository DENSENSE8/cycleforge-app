/**
 * The queue-counts cache shape has TWO writers (browser fetch + RSC dehydrate
 * seed) against one TanStack key. These pin the field the seed silently dropped:
 * `packPlacement` reached the client as `undefined`, so To-ship's "At stations"
 * tile and the per-bench chips read zero benches for the query's whole
 * staleTime — settled, wrong, and with no error to notice.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ZERO_QUEUE_COUNTS,
  normalizeQueueCountsPayload,
} from './queue-counts-normalize';

const BENCH = {
  locationId: 116,
  locationName: 'QA Pack Desk 1',
  locationBarcode: 'QA-PACK-DESK-01',
  locationKind: 'DESK' as const,
  count: 2,
};

test('packPlacement survives normalization — the field the seed dropped', () => {
  const out = normalizeQueueCountsPayload({
    total: 27,
    byStage: { all: 27, pending: 26, tested: 1 },
    urgent: 3,
    combos: [{ hasTechScan: true, blocked: false, count: 1 }],
    packPlacement: { counts: [BENCH], totalPlaced: 2 },
  });
  assert.ok(out);
  assert.deepEqual(out.packPlacement?.counts, [BENCH]);
  assert.equal(out.packPlacement?.totalPlaced, 2);
  assert.equal(out.total, 27);
  assert.equal(out.urgent, 3);
  assert.deepEqual(out.byStage, { all: 27, pending: 26, tested: 1 });
});

test('a payload with no packPlacement block falls back to an empty bench list', () => {
  const out = normalizeQueueCountsPayload({ total: 5 });
  assert.ok(out);
  // Empty, not undefined — a bench row reading `counts.length` must not throw.
  assert.deepEqual(out.packPlacement, ZERO_QUEUE_COUNTS.packPlacement);
  assert.deepEqual(out.combos, []);
  assert.equal(out.urgent, 0);
});

test('a malformed packPlacement degrades to zero rather than a broken shape', () => {
  const out = normalizeQueueCountsPayload({
    total: 5,
    packPlacement: { counts: 'nope', totalPlaced: 'nope' },
  });
  assert.deepEqual(out?.packPlacement, { counts: [], totalPlaced: 0 });
});

test('an unusable payload is null so each caller picks its own fallback', () => {
  // The browser path serves zeros; the seed leaves the key unset and lets the
  // client fetch — a seeded zero would look settled and suppress the refetch.
  assert.equal(normalizeQueueCountsPayload(null), null);
  assert.equal(normalizeQueueCountsPayload({}), null);
  assert.equal(normalizeQueueCountsPayload({ total: 'many' }), null);
  assert.equal(normalizeQueueCountsPayload('nope'), null);
});
