/**
 * Source guard: high-qty Unbox lines must not mount one DOM row per expected
 * unit. Pins qty-rollup branch + UnitSlotList display cap wiring.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/bulk-qty-display.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const MODE = code(sourceOf('./line-receive-mode.ts'));
const ROWS = code(sourceOf('./ReceivingUnitRows.tsx'));
const SLOTS = code(sourceOf('./UnitSlotList.tsx'));
const BULK = code(sourceOf('./BulkQuantityPanel.tsx'));
const ACTIVE = code(sourceOf('./line-edit/ActiveLineConditionSerial.tsx'));

test('SoT exports UNIT_ROW_DISPLAY_CAP and resolveLineReceiveMode', () => {
  assert.match(MODE, /export const UNIT_ROW_DISPLAY_CAP\s*=\s*12/);
  assert.match(MODE, /export function resolveLineReceiveMode/);
  assert.match(MODE, /export function unitRowVisibleWindow/);
});

test('ReceivingUnitRows branches on resolveLineReceiveMode and mounts BulkQuantityPanel', () => {
  assert.match(ROWS, /resolveLineReceiveMode/);
  assert.match(ROWS, /BulkQuantityPanel/);
  assert.match(ROWS, /data-receive-mode="qtyRollup"/);
  assert.match(ROWS, /data-receive-mode="unitTrack"/);
  assert.match(ROWS, /Track each unit|onTrackEachUnit/);
});

test('unit-track mode passes UNIT_ROW_DISPLAY_CAP into UnitSlotList', () => {
  assert.match(ROWS, /maxVisible=\{UNIT_ROW_DISPLAY_CAP\}/);
  assert.match(ROWS, /UnitSlotsManageOverlay/);
  assert.match(ROWS, /data-unit-overflow-cta|\+\{overflowCount\} more/);
});

test('UnitSlotList honors maxVisible via unitRowVisibleWindow', () => {
  assert.match(SLOTS, /maxVisible\?:/);
  assert.match(SLOTS, /unitRowVisibleWindow/);
  assert.match(SLOTS, /overflowSlot/);
  assert.match(SLOTS, /data-unit-slot-count/);
});

test('BulkQuantityPanel exposes apply + track-each-unit escape', () => {
  assert.match(BULK, /data-bulk-quantity-panel/);
  assert.match(BULK, /onTrackEachUnit/);
  assert.match(BULK, /Split remainder by condition/);
});

test('Progressive bulk stamp is flush full-width (no host pad)', () => {
  // Host vs content pad — progressive Unbox qty roll-up is an edge-to-edge
  // instrument (same rhythm as PoLineCaptureRow / UnboxDockHost). Never
  // reintroduce px-2 / pb-2 / space-y air around the stamp row.
  assert.doesNotMatch(
    BULK,
    /progressive\s*&&\s*['"`][^'"`]*px-2/,
    'progressive stamp must not host px-2',
  );
  assert.doesNotMatch(
    BULK,
    /progressive\s*&&\s*['"`][^'"`]*pb-2/,
    'progressive stamp must not host pb-2',
  );
  assert.match(
    BULK,
    /progressive\s*\?\s*['"`]space-y-0 p-0['"`]/,
    'progressive host is space-y-0 p-0',
  );
  assert.match(
    BULK,
    /h-11 w-full items-stretch gap-0/,
    'progressive stamp is a full-width h-11 abutting band',
  );
});

test('Progressive Unbox qty roll-up uses capture face + bulk apply (no inline no-serial)', () => {
  const LIST = code(sourceOf('./line-edit/PoLineUnitCaptureList.tsx'));
  assert.match(
    LIST,
    /<PoLineCaptureRow/,
    'qty roll-up mounts the capture face above Apply',
  );
  assert.match(
    LIST,
    /<BulkQuantityPanel[\s\S]*hideCondition[\s\S]*progressive/,
    'PoLineUnitCaptureList qtyRollup passes hideCondition + progressive',
  );
  assert.doesNotMatch(
    LIST,
    /noSerialControl/,
    'rollup no longer mounts inline NoSerialControl',
  );
  assert.match(
    BULK,
    /hideCondition/,
    'BulkQuantityPanel can defer condition to PoLineCaptureRow',
  );
  assert.match(
    BULK,
    /data-bulk-progressive/,
    'progressive bulk exposes a stable data hook',
  );
});

test('ActiveLineConditionSerial stamps empty units on line-level no-serial', () => {
  assert.match(ACTIVE, /markAllEmptyReceivingUnitsSerialAbsent/);
});
