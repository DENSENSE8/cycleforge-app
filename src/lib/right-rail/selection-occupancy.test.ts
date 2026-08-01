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

test('one row inspects, two compare, three or more stage for a batch', () => {
  assert.equal(resolveRailOccupancy([4821]).kind, 'inspect');
  assert.equal(resolveRailOccupancy([4821, 4830]).kind, 'compare');
  assert.equal(resolveRailOccupancy([4821, 4830, 4844]).kind, 'attention');
  assert.equal(resolveRailOccupancy([1, 2, 3, 4, 5, 6]).kind, 'attention');
});

test('the compare boundary is exactly two — three is a roster, not a wider compare', () => {
  assert.equal(COMPARE_SELECTION_SIZE, 2);
  assert.equal(resolveRailOccupancy(Array.from({ length: 2 }, (_, i) => i + 1)).kind, 'compare');
  assert.equal(
    resolveRailOccupancy(Array.from({ length: COMPARE_SELECTION_SIZE + 1 }, (_, i) => i + 1)).kind,
    'attention',
  );
});

test('every non-empty kind exposes orderIds, so the shared bands never branch on kind', () => {
  // The selection band ("6 of 142 selected") and the action region are shared
  // across all three bodies — they read `orderIds` and nothing else.
  for (const ids of [[4821], [4821, 4830], [4821, 4830, 4844]]) {
    const occupancy = resolveRailOccupancy(ids);
    assert.notEqual(occupancy.kind, 'none');
    if (occupancy.kind === 'none') return;
    assert.deepEqual([...occupancy.orderIds], ids);
  }
});

test('inspect carries a scalar orderId for the single-record panel', () => {
  const occupancy = resolveRailOccupancy(['4821']);
  assert.equal(occupancy.kind, 'inspect');
  if (occupancy.kind !== 'inspect') return;
  assert.equal(occupancy.orderId, 4821);
  assert.equal(typeof occupancy.orderId, 'number');
});

test('compare preserves selection order — the columns must not swap under the operator', () => {
  // The bus re-broadcasts the WHOLE selection on every change, so a resolver that
  // sorted (or de-duped by last occurrence) would flip the two compare columns
  // mid-read. First-selected renders left.
  const occupancy = resolveRailOccupancy([4830, 4821]);
  assert.equal(occupancy.kind, 'compare');
  if (occupancy.kind !== 'compare') return;
  assert.deepEqual([...occupancy.orderIds], [4830, 4821]);
  assert.notDeepEqual([...occupancy.orderIds], [4821, 4830]);
});

test('duplicates collapse to first-seen, so a re-broadcast cannot change the kind', () => {
  // Two ids arriving as three events must stay `compare`, not become `attention`.
  const occupancy = resolveRailOccupancy([4821, 4830, 4821]);
  assert.equal(occupancy.kind, 'compare');
  if (occupancy.kind !== 'compare') return;
  assert.deepEqual([...occupancy.orderIds], [4821, 4830]);
});

test('ids are coerced and non-row values are dropped once, here', () => {
  // Every bulk handler used to repeat `.map(Number).filter(Number.isFinite)`.
  assert.deepEqual(normalizeRailSelection(['12', 13, '14']), [12, 13, 14]);
  assert.deepEqual(normalizeRailSelection([0, -1, 1.5, Number.NaN, Infinity, 7]), [7]);
  assert.deepEqual(normalizeRailSelection([null, undefined, '', '  ']), []);
});

test('junk mixed with real ids does not shift the kind', () => {
  // A single real id beside two unresolvable ones is an INSPECT, not an
  // attention roster over rows the rail could never load.
  assert.equal(resolveRailOccupancy([4821, Number.NaN, null]).kind, 'inspect');
});

test('occupant ids are stable per mode and never carry a record id', () => {
  // D5: the host keys AnimatePresence on the occupant id, so a per-record id
  // makes every row→row step a full exit-then-enter with an empty slot between.
  assert.equal(resolveRailOccupancy([4821]).kind, 'inspect');
  const a = resolveRailOccupancy([4821]);
  const b = resolveRailOccupancy([9999]);
  if (a.kind === 'none' || b.kind === 'none') return;
  assert.equal(a.occupantId, b.occupantId);
  assert.equal(a.occupantId, RAIL_OCCUPANT_ID.inspect);

  for (const id of Object.values(RAIL_OCCUPANT_ID)) {
    assert.equal(/\d/.test(id), false, `${id} must not embed a record id`);
  }
  // Three distinct modes, three distinct ids.
  assert.equal(new Set(Object.values(RAIL_OCCUPANT_ID)).size, 3);
});

test('the 1-row occupant id is the one the existing inspector already registers', () => {
  // ShippedDetailsPanel registers `detail:order` today. Renaming it here would
  // silently orphan that panel, so it is pinned.
  assert.equal(RAIL_OCCUPANT_ID.inspect, 'detail:order');
});

test('exactly one registrar is active per selection', () => {
  const cases = [
    { ids: [] as number[], active: null },
    { ids: [1], active: 'inspect' as const },
    { ids: [1, 2], active: 'compare' as const },
    { ids: [1, 2, 3], active: 'attention' as const },
  ];
  for (const { ids, active } of cases) {
    const occupancy = resolveRailOccupancy(ids);
    for (const kind of ['inspect', 'compare', 'attention'] as const) {
      assert.equal(
        isRailOccupantActive(occupancy, kind),
        kind === active,
        `${kind} claim for a selection of ${ids.length}`,
      );
    }
  }
});
