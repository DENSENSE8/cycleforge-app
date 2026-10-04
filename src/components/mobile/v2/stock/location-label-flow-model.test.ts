import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RackDetail, RackShelf } from '@/lib/locations/rack-types';
import { allLabelKeys, labelChoices, labelRows, PLACARD_KEY, shownLabelKeys } from './location-label-flow-model';

function shelf(n: number, tier: RackShelf['tier'] = null): RackShelf {
  return { id: 100 + n, code: `RK12-${n}`, name: `Rack 12 Shelf ${n}`, shelf: n, tier, capacity: null, sortOrder: n, stockQty: 0, positions: [] };
}

const RACK: Pick<RackDetail, 'id' | 'code' | 'name' | 'shelves'> = {
  id: 12,
  code: 'RK12',
  name: 'Rack 12',
  // Out of shelf order on purpose: the flow always prints shelf order.
  shelves: [shelf(3), shelf(1, 0), shelf(2, 2)],
};

test('Shelves opens with the placard and every shelf selected', () => {
  assert.deepEqual([...allLabelKeys(RACK)].sort(), [PLACARD_KEY, 'RK12-1', 'RK12-2', 'RK12-3'].sort());
});

test('labelChoices lists the placard then shelves in shelf order; arrival-only keeps tiered shelves and drops the placard', () => {
  const all = labelChoices(RACK, false);
  assert.equal(all.placard, true);
  assert.deepEqual(all.shelves.map((s) => s.code), ['RK12-1', 'RK12-2', 'RK12-3']);
  assert.deepEqual(shownLabelKeys(all), [PLACARD_KEY, 'RK12-1', 'RK12-2', 'RK12-3']);
  const arrival = labelChoices(RACK, true);
  assert.equal(arrival.placard, false);
  assert.deepEqual(shownLabelKeys(arrival), ['RK12-1', 'RK12-2']);
});

test('labelRows prints selected AND shown rows, placard first, with no room and the shelf tier', () => {
  const rows = labelRows(RACK, allLabelKeys(RACK), false);
  assert.deepEqual(rows.map((r) => [r.barcode, r.roomName, r.arrivalPriorityTier]), [
    ['RK12', null, null],
    ['RK12-1', null, 0],
    ['RK12-2', null, 2],
    ['RK12-3', null, null],
  ]);
  // Arrival-only hides the placard and the untiered shelf even though they stay selected.
  assert.deepEqual(labelRows(RACK, allLabelKeys(RACK), true).map((r) => r.barcode), ['RK12-1', 'RK12-2']);
  assert.deepEqual(labelRows(RACK, new Set(['RK12-3']), false).map((r) => r.barcode), ['RK12-3']);
});
