import test from 'node:test';
import assert from 'node:assert/strict';
import { orderQcQueue, qcQueueAge, qcQueueTier, type QcQueueSortKey, type QcQueueTierFacts } from './qc-queue-order';

const plain: QcQueueTierFacts = {
  cartonIsReturn: false,
  cartonIntakeType: 'PO',
  cartonSource: 'zoho_po',
  lineReceivingType: 'PO',
  lineIntakeType: 'po',
  lineIsRepairService: false,
  lineHasRepairFact: false,
  qcState: 'PENDING',
  unitStatus: 'RECEIVED',
};

test('each tier is reached by its own signal', () => {
  assert.equal(qcQueueTier(plain), 'qc');
  assert.equal(qcQueueTier({ ...plain, cartonIsReturn: true }), 'return');
  assert.equal(qcQueueTier({ ...plain, cartonIntakeType: 'RETURN' }), 'return');
  assert.equal(qcQueueTier({ ...plain, lineReceivingType: 'RETURN' }), 'return');
  assert.equal(qcQueueTier({ ...plain, lineIntakeType: 'return' }), 'return');
  assert.equal(qcQueueTier({ ...plain, lineIsRepairService: true }), 'repair');
  assert.equal(qcQueueTier({ ...plain, lineHasRepairFact: true }), 'repair');
  assert.equal(qcQueueTier({ ...plain, lineIntakeType: 'repair' }), 'repair');
  assert.equal(qcQueueTier({ ...plain, cartonSource: 'unmatched' }), 'unfound');
  assert.equal(qcQueueTier({ ...plain, cartonSource: 'local_pickup' }), 'pickup');
  assert.equal(qcQueueTier({ ...plain, lineReceivingType: 'PICKUP' }), 'pickup');
  assert.equal(qcQueueTier({ ...plain, qcState: 'TEST_AGAIN' }), 'retest');
  assert.equal(qcQueueTier({ ...plain, unitStatus: 'IN_TEST' }), 'retest');
});

test('tier precedence follows the owner order: the first matching tier wins', () => {
  // A returned repair-service line is a Return.
  assert.equal(qcQueueTier({ ...plain, cartonIsReturn: true, lineIsRepairService: true }), 'return');
  // A repair on an unfound carton is Repair service.
  assert.equal(qcQueueTier({ ...plain, lineIntakeType: 'repair', cartonSource: 'unmatched' }), 'repair');
  // An unfound TEST_AGAIN unit is Unfound.
  assert.equal(qcQueueTier({ ...plain, cartonSource: 'unmatched', qcState: 'TEST_AGAIN' }), 'unfound');
  // A local-pickup unit sent back to test is Local pickup.
  assert.equal(qcQueueTier({ ...plain, cartonSource: 'local_pickup', unitStatus: 'IN_TEST' }), 'pickup');
});

const key = (serialUnitId: number, over: Partial<QcQueueSortKey> = {}): QcQueueSortKey => ({
  serialUnitId,
  tier: 'qc',
  priority: false,
  unboxedAt: '2026-09-01T10:00:00Z',
  ...over,
});

const ids = (rows: QcQueueSortKey[]) => orderQcQueue(rows).map((row) => row.serialUnitId);

test('tiers sort in the owner order regardless of age or priority', () => {
  const rows = [
    key(1, { tier: 'qc', priority: true, unboxedAt: '2026-01-01T00:00:00Z' }),
    key(2, { tier: 'retest' }),
    key(3, { tier: 'pickup' }),
    key(4, { tier: 'unfound' }),
    key(5, { tier: 'repair' }),
    key(6, { tier: 'return', unboxedAt: null }),
  ];
  assert.deepEqual(ids(rows), [6, 5, 4, 3, 2, 1]);
});

test('inside a tier: priority carton first, then oldest unbox, never-unboxed last, then unit id', () => {
  const rows = [
    key(10, { unboxedAt: null }),
    key(11, { unboxedAt: '2026-09-02T00:00:00Z' }),
    key(12, { unboxedAt: '2026-05-20T00:00:00Z' }),
    key(13, { priority: true, unboxedAt: '2026-09-20T00:00:00Z' }),
    key(9, { unboxedAt: null }),
    key(14, { unboxedAt: '2026-05-20T00:00:00Z' }),
  ];
  assert.deepEqual(ids(rows), [13, 12, 14, 11, 9, 10]);
});

test('age reads hours under a day, days after, and alerts only past the threshold', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  assert.deepEqual(qcQueueAge('2026-09-29T07:00:00Z', now), { face: '5H', alert: false });
  assert.deepEqual(qcQueueAge('2026-09-27T11:00:00Z', now), { face: '2D', alert: false });
  assert.deepEqual(qcQueueAge('2026-09-26T11:00:00Z', now), { face: '3D', alert: true });
  assert.deepEqual(qcQueueAge(null, now), { face: '—', alert: false });
});
