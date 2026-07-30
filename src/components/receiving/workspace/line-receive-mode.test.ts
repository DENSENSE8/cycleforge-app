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
  resolveLineReceiveMode,
  unitRowVisibleWindow,
} from './line-receive-mode';

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
