import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RackDetail, RackShelf } from '@/lib/locations/rack-types';
import { allLabelKeys, labelRows, labelShelves, PLACARD_KEY, shownLabelKeys } from './location-label-flow-model';

function shelf(n: number): RackShelf {
  return { id: 100 + n, code: `RK12-${n}`, name: `Rack 12 Shelf ${n}`, shelf: n, capacity: null, sortOrder: n, stockQty: 0, positions: [] };
}

const RACK: Pick<RackDetail, 'id' | 'code' | 'name' | 'shelves'> = {
  id: 12,
  code: 'RK12',
  name: 'Rack 12',
  // Out of shelf order on purpose: the flow always prints shelf order.
  shelves: [shelf(3), shelf(1), shelf(2)],
};

test('Shelves opens with the placard and every shelf selected', () => {
  assert.deepEqual([...allLabelKeys(RACK)].sort(), [PLACARD_KEY, 'RK12-1', 'RK12-2', 'RK12-3'].sort());
});

test('the Shelves step lists the placard then shelves in shelf order', () => {
  assert.deepEqual(labelShelves(RACK).map((s) => s.code), ['RK12-1', 'RK12-2', 'RK12-3']);
  assert.deepEqual(shownLabelKeys(RACK), [PLACARD_KEY, 'RK12-1', 'RK12-2', 'RK12-3']);
});

test('labelRows prints the selected rows, placard first, with no room and nothing but identification', () => {
  const rows = labelRows(RACK, allLabelKeys(RACK));
  assert.deepEqual(rows, [
    { id: 12, name: 'Rack 12', barcode: 'RK12', roomName: null },
    { id: 101, name: 'Rack 12 Shelf 1', barcode: 'RK12-1', roomName: null },
    { id: 102, name: 'Rack 12 Shelf 2', barcode: 'RK12-2', roomName: null },
    { id: 103, name: 'Rack 12 Shelf 3', barcode: 'RK12-3', roomName: null },
  ]);
  assert.deepEqual(labelRows(RACK, new Set(['RK12-3'])).map((r) => r.barcode), ['RK12-3']);
});
