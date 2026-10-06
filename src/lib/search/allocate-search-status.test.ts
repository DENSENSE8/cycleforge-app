import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOCATE_SEARCH_FULFILLED,
  allocateSearchStatus,
  sqlAllocateSearchStatus,
  type AllocateSearchSignals,
} from './allocate-search-status';

const open: AllocateSearchSignals = {
  buyerCancelled: false,
  amazonFulfilled: false,
  carrierMoved: false,
  scannedOut: false,
  packed: false,
  picked: false,
};

test('an order still on Allocate reads To pick, even when the channel says shipped', () => {
  assert.equal(allocateSearchStatus(open), 'To pick');
});

test('pick and pack scans advance the chip along Allocate', () => {
  assert.equal(allocateSearchStatus({ ...open, picked: true }), 'Picked');
  assert.equal(allocateSearchStatus({ ...open, picked: true, packed: true }), 'Packed');
});

test('dock scan-out is Scanned out; a carrier that has moved the package is Fulfilled', () => {
  assert.equal(allocateSearchStatus({ ...open, scannedOut: true }), 'Scanned out');
  assert.equal(allocateSearchStatus({ ...open, scannedOut: true, carrierMoved: true }), ALLOCATE_SEARCH_FULFILLED);
  assert.equal(allocateSearchStatus({ ...open, carrierMoved: true }), ALLOCATE_SEARCH_FULFILLED);
});

test('buyer cancel wins over a moved carrier', () => {
  assert.equal(
    allocateSearchStatus({ ...open, buyerCancelled: true, carrierMoved: true, packed: true }),
    'Buyer cancel',
  );
});

test('the SQL expression names the stages in the same order as allocateSearchStatus', () => {
  const sql = sqlAllocateSearchStatus();
  const at = (label: string) => sql.indexOf(`'${label}'`);
  const order = ['Buyer cancel', ALLOCATE_SEARCH_FULFILLED, 'Scanned out', 'Packed', 'Picked', 'To pick'];
  const indexes = order.map(at);
  assert.ok(indexes.every((i) => i > 0), sql);
  for (let i = 1; i < indexes.length; i++) {
    assert.ok(indexes[i]! > indexes[i - 1]!, `${order[i]} follows ${order[i - 1]}`);
  }
});
