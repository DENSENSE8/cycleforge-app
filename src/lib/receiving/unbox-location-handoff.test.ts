/**
 *   node_modules/.bin/tsx --test src/lib/receiving/unbox-location-handoff.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_LOCATION_HOTKEY,
  lineStagePatchFromRealtime,
  unboxLocationKeyAwake,
  unboxLocationTarget,
} from './unbox-location-handoff';

test('a real line is placed as the line', () => {
  assert.deepEqual(unboxLocationTarget({ lineId: 12, receivingId: 53426, cartonFallback: true }), {
    kind: 'line',
    lineId: 12,
    receivingId: 53426,
  });
  assert.deepEqual(unboxLocationTarget({ lineId: 12, receivingId: null, cartonFallback: false }), {
    kind: 'line',
    lineId: 12,
    receivingId: null,
  });
});

test('an unfound LPN (synthetic negative line id) places the LPN itself on Unbox', () => {
  assert.deepEqual(unboxLocationTarget({ lineId: -53426, receivingId: 53426, cartonFallback: true }), {
    kind: 'carton',
    receivingId: 53426,
  });
  assert.deepEqual(unboxLocationTarget({ lineId: null, receivingId: 53426, cartonFallback: true }), {
    kind: 'carton',
    receivingId: 53426,
  });
});

test('no line and no carton fallback (other stations) or no receiving id → nothing to place', () => {
  assert.equal(unboxLocationTarget({ lineId: -53426, receivingId: 53426, cartonFallback: false }), null);
  assert.equal(unboxLocationTarget({ lineId: null, receivingId: null, cartonFallback: true }), null);
  assert.equal(unboxLocationTarget({ lineId: Number.NaN, receivingId: 0, cartonFallback: true }), null);
  assert.equal(unboxLocationTarget({ lineId: 1.5, receivingId: -1, cartonFallback: true }), null);
});

test('the L key is awake only with a target and no text field or overlay holding the keyboard', () => {
  const target = unboxLocationTarget({ lineId: null, receivingId: 7, cartonFallback: true });
  assert.equal(UNBOX_LOCATION_HOTKEY, 'l');
  assert.equal(unboxLocationKeyAwake({ target, editableFocused: false, overlayOpen: false }), true);
  assert.equal(unboxLocationKeyAwake({ target, editableFocused: true, overlayOpen: false }), false);
  assert.equal(unboxLocationKeyAwake({ target, editableFocused: false, overlayOpen: true }), false);
  assert.equal(unboxLocationKeyAwake({ target: null, editableFocused: false, overlayOpen: false }), false);
});

test('a lines/stage broadcast repaints only its own line', () => {
  const data = {
    source: 'receiving.lines.stage',
    rowId: '53426',
    row: {
      receiving_line_id: 12,
      staged_at: '2026-10-07 10:00:00',
      staged_location_id: 88,
      staged_location_name: 'Rack 1 Shelf 2',
      staged_location_barcode: 'RK1-2',
      staged_location_room: '',
    },
  };
  assert.deepEqual(lineStagePatchFromRealtime(data, 12), {
    id: 12,
    staged_at: '2026-10-07 10:00:00',
    staged_location_id: 88,
    staged_location_name: 'Rack 1 Shelf 2',
    staged_location_barcode: 'RK1-2',
    staged_location_room: null,
  });
  assert.equal(lineStagePatchFromRealtime(data, 13), null);
  assert.equal(lineStagePatchFromRealtime({ ...data, source: 'receiving.arrival' }, 12), null);
  assert.equal(lineStagePatchFromRealtime({ source: 'receiving.lines.stage' }, 12), null);
  assert.equal(lineStagePatchFromRealtime(null, 12), null);
});

test('an unstage broadcast clears the face', () => {
  const patch = lineStagePatchFromRealtime(
    { source: 'receiving.lines.stage', row: { receiving_line_id: 12, staged_at: null, staged_location_id: null } },
    12,
  );
  assert.deepEqual(patch, {
    id: 12,
    staged_at: null,
    staged_location_id: null,
    staged_location_name: null,
    staged_location_barcode: null,
    staged_location_room: null,
  });
});
