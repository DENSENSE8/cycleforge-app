import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePickListPayload,
  parsePickListScope,
  type PickListRow,
} from './pick-list-payload';

const ROW = {
  allocationId: '9007199254740993',
  orderId: 4211,
  orderNumber: '14-13290-88711',
  sku: 'IT-44821',
  productTitle: 'Dell Latitude 5420',
  serialUnitId: 88,
  serialNumber: '3CX7YH2',
  grade: 'REFURBISHED',
  location: 'A-04-12',
  deadlineAt: '2026-09-16T00:00:00.000Z',
  ownerStaffId: 1,
};

test('allocation id survives as a string — a bigint past 2^53 must not be coerced', () => {
  const list = normalizePickListPayload(
    { scope: 'mine', staffId: 1, counts: {}, groups: [{ staffId: 1, staffName: 'Michael', rows: [ROW] }] },
    'mine',
  );
  assert.equal(list.groups[0]?.rows[0]?.allocationId, '9007199254740993');
});

test('a row with no serial or no allocation id is dropped, not painted blank', () => {
  const list = normalizePickListPayload(
    {
      groups: [
        {
          staffId: 1,
          staffName: 'Michael',
          rows: [ROW, { ...ROW, allocationId: '', serialUnitId: 89 }, { ...ROW, serialNumber: '   ' }],
        },
      ],
    },
    'mine',
  );
  assert.deepEqual(
    list.groups[0]?.rows.map((row: PickListRow) => row.serialUnitId),
    [88],
  );
});

test('a group whose rows were all dropped does not paint an empty staff header', () => {
  const list = normalizePickListPayload(
    { groups: [{ staffId: 2, staffName: 'Ana', rows: [{ orderId: 1 }] }] },
    'all',
  );
  assert.deepEqual(list.groups, []);
});

test('the unpaired bucket sorts last so a picker reads their own name first', () => {
  const list = normalizePickListPayload(
    {
      groups: [
        { staffId: null, staffName: null, rows: [ROW] },
        { staffId: 1, staffName: 'Michael', rows: [ROW] },
        { staffId: 2, staffName: 'Ana', rows: [ROW] },
      ],
    },
    'all',
  );
  assert.deepEqual(
    list.groups.map((group) => group.staffId),
    [1, 2, null],
  );
});

test('a malformed payload degrades to an empty list with zero counts, never throws', () => {
  for (const payload of [null, 'nope', { groups: 'not-an-array', counts: 7 }]) {
    const list = normalizePickListPayload(payload, 'unpaired');
    assert.deepEqual(list.groups, []);
    assert.deepEqual(list.counts, { mine: 0, all: 0, unpaired: 0, unallocated: 0 });
    assert.equal(list.scope, 'unpaired');
  }
});

test('counts reject negatives and non-numbers rather than rendering them', () => {
  const list = normalizePickListPayload(
    { counts: { mine: '3', all: -1, unpaired: null, unallocated: 12.7 } },
    'mine',
  );
  assert.deepEqual(list.counts, { mine: 3, all: 0, unpaired: 0, unallocated: 12 });
});

test('scope falls back to mine for an unknown or absent ?scope=', () => {
  assert.equal(parsePickListScope('UNPAIRED'), 'unpaired');
  assert.equal(parsePickListScope('everything'), 'mine');
  assert.equal(parsePickListScope(null), 'mine');
});
