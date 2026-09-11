import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  COMPARE_SELECTION_SIZE,
  RAIL_OCCUPANT_ID,
  isRailOccupantActive,
  normalizeRailSelection,
  resolveRailOccupancy,
} from './selection-occupancy';

test('an empty selection mounts nothing', () => {
  assert.deepEqual(resolveRailOccupancy([]), { kind: 'none' });
  // A selection of nothing but junk is still a selection of nothing — the rail
  // must not mount an inspector over an id it cannot resolve.
  assert.deepEqual(resolveRailOccupancy([null, undefined, '', Number.NaN]), { kind: 'none' });
});

test('checkbox selection never claims the right rail', () => {
  assert.equal(resolveRailOccupancy([4821]).kind, 'none');
  assert.equal(resolveRailOccupancy([4821, 4830]).kind, 'none');
  assert.equal(resolveRailOccupancy([4821, 4830, 4844]).kind, 'none');
  assert.equal(resolveRailOccupancy([1, 2, 3, 4, 5, 6]).kind, 'none');
});

test('the retired compare pane was exactly two columns — not a wider compare', () => {
  assert.equal(COMPARE_SELECTION_SIZE, 2);
  assert.equal(resolveRailOccupancy(Array.from({ length: 2 }, (_, i) => i + 1)).kind, 'none');
  assert.equal(
    resolveRailOccupancy(Array.from({ length: COMPARE_SELECTION_SIZE + 1 }, (_, i) => i + 1)).kind,
    'none',
  );
});

test('ids are coerced and non-row values are dropped once, here', () => {
  // Every bulk handler used to repeat `.map(Number).filter(Number.isFinite)`.
  assert.deepEqual(normalizeRailSelection(['12', 13, '14']), [12, 13, 14]);
  assert.deepEqual(normalizeRailSelection([0, -1, 1.5, Number.NaN, Infinity, 7]), [7]);
  assert.deepEqual(normalizeRailSelection([null, undefined, '', '  ']), []);
});

test('junk mixed with real ids still mounts no rail', () => {
  assert.equal(resolveRailOccupancy([4821, Number.NaN, null]).kind, 'none');
});

test('occupant ids stay reserved per mode and never carry a record id', () => {
  for (const id of Object.values(RAIL_OCCUPANT_ID)) {
    assert.equal(/\d/.test(id), false, `${id} must not embed a record id`);
  }
  // Three distinct mode ids remain reserved (inspect / compare / retired batch).
  assert.equal(new Set(Object.values(RAIL_OCCUPANT_ID)).size, 3);
});

test('the reserved 1-row occupant id is the one the existing inspector already registers', () => {
  // ShippedDetailsPanel registers `detail:order` today. Renaming it here would
  // silently orphan that panel, so it is pinned even though occupancy never
  // returns inspect.
  assert.equal(RAIL_OCCUPANT_ID.inspect, 'detail:order');
  assert.equal(RAIL_OCCUPANT_ID.compare, 'detail:order-compare');
});

test('no registrar is active for any selection size', () => {
  const cases = [[], [1], [1, 2], [1, 2, 3]];
  for (const ids of cases) {
    const occupancy = resolveRailOccupancy(ids);
    for (const kind of ['inspect', 'compare', 'attention'] as const) {
      assert.equal(
        isRailOccupantActive(occupancy, kind),
        false,
        `${kind} claim for a selection of ${ids.length}`,
      );
    }
  }
});
