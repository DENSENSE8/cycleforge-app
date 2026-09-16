import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePickListScope,
  selectPickListGroups,
  type PickListSourceRow,
} from './pick-list-groups';

function row(over: Partial<PickListSourceRow> & { serialUnitId: number }): PickListSourceRow {
  return {
    allocationId: String(over.serialUnitId * 10),
    orderId: 100 + over.serialUnitId,
    orderNumber: `ORD-${over.serialUnitId}`,
    sku: 'SKU-A',
    productTitle: 'Dell Latitude',
    serialNumber: `SN${over.serialUnitId}`,
    grade: 'USED_A',
    location: 'A-01',
    deadlineAt: null,
    ownerStaffId: null,
    ownerStaffName: null,
    ...over,
  };
}

test("scope 'all' puts the UNPAIRED bucket last even when it comes first in location order", () => {
  const rows = [
    row({ serialUnitId: 1, location: 'A-01', ownerStaffId: null }),
    row({ serialUnitId: 2, location: 'B-02', ownerStaffId: 7, ownerStaffName: 'Michael' }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'all', staffId: 7 });

  assert.deepEqual(groups.map((g) => g.staffId), [7, null]);
  assert.equal(groups[1].staffName, null);
});

test("scope 'mine' excludes another staff's rows and the unpaired bucket", () => {
  const rows = [
    row({ serialUnitId: 1, ownerStaffId: 7, ownerStaffName: 'Michael' }),
    row({ serialUnitId: 2, ownerStaffId: 9, ownerStaffName: 'Ana' }),
    row({ serialUnitId: 3, ownerStaffId: null }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'mine', staffId: 7 });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].staffId, 7);
  assert.deepEqual(groups[0].rows.map((r) => r.serialUnitId), [1]);
});

test("scope 'mine' with no session staff yields nothing rather than everything", () => {
  const rows = [row({ serialUnitId: 1, ownerStaffId: 7 }), row({ serialUnitId: 2, ownerStaffId: null })];

  assert.deepEqual(selectPickListGroups(rows, { scope: 'mine', staffId: null }), []);
});

test("scope 'unpaired' keeps only rows with no owning picker", () => {
  const rows = [
    row({ serialUnitId: 1, ownerStaffId: 7, ownerStaffName: 'Michael' }),
    row({ serialUnitId: 2, ownerStaffId: null }),
    row({ serialUnitId: 3, ownerStaffId: null }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'unpaired', staffId: 7 });

  assert.deepEqual(groups.map((g) => g.staffId), [null]);
  assert.deepEqual(groups[0].rows.map((r) => r.serialUnitId), [2, 3]);
});

test('rows keep the incoming shelf order inside a group (the walk must not be re-sorted)', () => {
  const rows = [
    row({ serialUnitId: 1, location: 'A-01', ownerStaffId: 7, orderNumber: 'ORD-Z' }),
    row({ serialUnitId: 2, location: 'A-04', ownerStaffId: 7, orderNumber: 'ORD-A' }),
    row({ serialUnitId: 3, location: 'C-09', ownerStaffId: 7, orderNumber: 'ORD-M' }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'all', staffId: 7 });

  assert.deepEqual(groups[0].rows.map((r) => r.location), ['A-01', 'A-04', 'C-09']);
});

test('a null-location row folds without crashing and stays at the end of its group', () => {
  // SQL orders NULLS LAST; folding must not reorder or choke on the null.
  const rows = [
    row({ serialUnitId: 1, location: 'A-01', ownerStaffId: 7 }),
    row({ serialUnitId: 2, location: null, ownerStaffId: 7 }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'all', staffId: 7 });

  assert.deepEqual(groups[0].rows.map((r) => r.location), ['A-01', null]);
});

test('group order follows first appearance in shelf order, not staff id', () => {
  const rows = [
    row({ serialUnitId: 1, location: 'A-01', ownerStaffId: 9, ownerStaffName: 'Ana' }),
    row({ serialUnitId: 2, location: 'B-01', ownerStaffId: 7, ownerStaffName: 'Michael' }),
    row({ serialUnitId: 3, location: 'B-02', ownerStaffId: 9, ownerStaffName: 'Ana' }),
  ];

  const groups = selectPickListGroups(rows, { scope: 'all', staffId: 7 });

  assert.deepEqual(groups.map((g) => g.staffId), [9, 7]);
  assert.deepEqual(groups[0].rows.map((r) => r.serialUnitId), [1, 3]);
});

test('folded rows carry no owner name (the wire row shape is fixed by the API contract)', () => {
  const groups = selectPickListGroups([row({ serialUnitId: 1, ownerStaffId: 7, ownerStaffName: 'Michael' })], {
    scope: 'all',
    staffId: 7,
  });

  assert.deepEqual(Object.keys(groups[0].rows[0]).sort(), [
    'allocationId',
    'currency',
    'deadlineAt',
    'grade',
    'imageUrl',
    'itemNumber',
    'location',
    'locationBarcode',
    'orderId',
    'orderNumber',
    'ownerStaffId',
    'productTitle',
    'qty',
    'saleAmount',
    'serialNumber',
    'serialUnitId',
    'sku',
  ]);
});

test('unknown or missing scope falls back to the picker\'s own list', () => {
  assert.equal(parsePickListScope(null), 'mine');
  assert.equal(parsePickListScope('everything'), 'mine');
  assert.equal(parsePickListScope('ALL'), 'all');
  assert.equal(parsePickListScope(' unpaired '), 'unpaired');
});
