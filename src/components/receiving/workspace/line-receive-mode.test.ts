/**
 * Unit + source guards for multi-qty Unbox display modes:
 *  - qty roll-up for high-qty identical lines (no 500 DOM rows)
 *  - hard UNIT_ROW_DISPLAY_CAP in unit-track mode
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/line-receive-mode.test.ts
 *        src/components/receiving/workspace/bulk-qty-display.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIT_ROW_DISPLAY_CAP,
  resolveCaptureEntry,
  resolveLineReceiveMode,
  unitRowVisibleWindow,
} from './line-receive-mode';

/** Facts for a normal matched Unbox line the operator is standing on. */
const activeLine = {
  dockOwnsCapture: true,
  isActiveLine: true,
  receivingId: 42,
  lineId: 7,
  quantityExpected: 1,
  serialCount: 0,
} as const;

test('UNIT_ROW_DISPLAY_CAP is a positive hard ceiling', () => {
  assert.equal(UNIT_ROW_DISPLAY_CAP, 12);
  assert.ok(UNIT_ROW_DISPLAY_CAP > 1);
});

test('qty 500 with no serials → qtyRollup', () => {
  assert.equal(
    resolveLineReceiveMode({ quantityExpected: 500, serialCount: 0 }),
    'qtyRollup',
  );
});

test('qty at or below cap → unitTrack even with no serials', () => {
  assert.equal(
    resolveLineReceiveMode({
      quantityExpected: UNIT_ROW_DISPLAY_CAP,
      serialCount: 0,
    }),
    'unitTrack',
  );
  assert.equal(
    resolveLineReceiveMode({ quantityExpected: 3, serialCount: 0 }),
    'unitTrack',
  );
});

test('any serial forces unitTrack even at high qty', () => {
  assert.equal(
    resolveLineReceiveMode({ quantityExpected: 500, serialCount: 1 }),
    'unitTrack',
  );
});

test('forceUnitMode overrides qty roll-up', () => {
  assert.equal(
    resolveLineReceiveMode({
      quantityExpected: 500,
      serialCount: 0,
      forceUnitMode: true,
    }),
    'unitTrack',
  );
});

// --- resolveCaptureEntry -----------------------------------------------
// THE gate. Every editable Unbox line mounts the capture face (not only the
// active line). Surfaces report facts; this owns the answer.

test('active Unbox line → capture row', () => {
  assert.equal(resolveCaptureEntry(activeLine), 'capture-unit');
});

test('multi-qty active line stays the capture row (one face per line)', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, quantityExpected: 4 }),
    'capture-unit',
  );
});

test('qty over the cap with no serials → capture rollup, not 150 rows', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, quantityExpected: 150 }),
    'capture-rollup',
  );
});

test('a serial on a high-qty line pulls it back to per-unit capture', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, quantityExpected: 150, serialCount: 1 }),
    'capture-unit',
  );
});

test('no line yet (empty unfound carton) → stub', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, lineId: null }),
    'capture-stub',
  );
});

test('a sibling Unbox line also mounts the capture face', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, isActiveLine: false }),
    'capture-unit',
  );
  assert.equal(
    resolveCaptureEntry({
      ...activeLine,
      isActiveLine: false,
      quantityExpected: 4,
    }),
    'capture-unit',
  );
  assert.equal(
    resolveCaptureEntry({
      ...activeLine,
      isActiveLine: false,
      quantityExpected: 150,
    }),
    'capture-rollup',
  );
});

test('Testing / Arrival (dock does not own capture) keep the legacy body', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, dockOwnsCapture: false }),
    'single',
  );
});

test('Units Displays flush + forceUnitRows never capture', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, flush: true }),
    'single',
  );
  assert.equal(
    resolveCaptureEntry({ ...activeLine, flush: true, forceUnitRows: true }),
    'unit-rows',
  );
  assert.equal(
    resolveCaptureEntry({ ...activeLine, forceUnitRows: true }),
    'capture-unit',
    'forceUnitRows alone is a Displays concern — it must not veto the centre row',
  );
});

test('an unsaved line (no receiving id) cannot capture', () => {
  assert.equal(
    resolveCaptureEntry({ ...activeLine, receivingId: null }),
    'single',
  );
  assert.equal(
    resolveCaptureEntry({ ...activeLine, receivingId: 0 }),
    'single',
  );
});

test('lineId 0 is invalid, not "no line" — it must not read as the stub', () => {
  assert.equal(resolveCaptureEntry({ ...activeLine, lineId: 0 }), 'single');
});

test('unitRowVisibleWindow never exceeds the cap', () => {
  const { start, end } = unitRowVisibleWindow(500, 0, UNIT_ROW_DISPLAY_CAP);
  assert.equal(start, 0);
  assert.equal(end - start, UNIT_ROW_DISPLAY_CAP);
});

test('unitRowVisibleWindow keeps selected index in view', () => {
  const { start, end } = unitRowVisibleWindow(500, 100, UNIT_ROW_DISPLAY_CAP);
  assert.ok(start <= 100 && 100 < end);
  assert.equal(end - start, UNIT_ROW_DISPLAY_CAP);
});

test('unitRowVisibleWindow at end of list clamps without overshoot', () => {
  const { start, end } = unitRowVisibleWindow(500, 499, UNIT_ROW_DISPLAY_CAP);
  assert.equal(end, 500);
  assert.equal(end - start, UNIT_ROW_DISPLAY_CAP);
  assert.ok(start <= 499);
});
