/**
 * Arrival command-barcode classifier matrix.
 *
 * Run: `npx tsx --test src/lib/receiving/arrival-command-routing.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_CMD_BATCH_SORT,
  ARRIVAL_CMD_DEFAULT,
  classifyArrivalScan,
  extractArrivalLocationBarcode,
} from './arrival-command-routing';

test('CMD-BATCH-SORT / CMD-DEFAULT classify as commands (case-insensitive)', () => {
  assert.deepEqual(classifyArrivalScan('CMD-BATCH-SORT', 'default'), {
    kind: 'command',
    raw: 'CMD-BATCH-SORT',
    command: 'batch_sort',
  });
  assert.equal(classifyArrivalScan('cmd-batch-sort', 'batch_sort').command, 'batch_sort');
  assert.equal(classifyArrivalScan(ARRIVAL_CMD_DEFAULT, 'batch_sort').command, 'default');
  assert.equal(classifyArrivalScan('cmd-default', 'default').command, 'default');
});

test('commands win over location/tracking heuristics in either mode', () => {
  assert.equal(classifyArrivalScan(ARRIVAL_CMD_BATCH_SORT, 'batch_sort').kind, 'command');
  assert.equal(classifyArrivalScan(ARRIVAL_CMD_DEFAULT, 'default').kind, 'command');
});

test('default mode treats flat shelf codes as tracking (not location)', () => {
  const result = classifyArrivalScan('A0101101', 'default');
  assert.equal(result.kind, 'tracking');
  assert.equal(result.locationBarcode, undefined);
});

test('batch_sort mode classifies flat / dashed location codes as location', () => {
  const flat = classifyArrivalScan('A0101101', 'batch_sort');
  assert.equal(flat.kind, 'location');
  assert.equal(flat.locationBarcode, 'A0101101');

  const dashed = classifyArrivalScan('A-01-01-1-01', 'batch_sort');
  assert.equal(dashed.kind, 'location');
  assert.equal(dashed.locationBarcode, 'A0101101');
});

test('LOC- prefix strips then unwraps to the same flat barcode', () => {
  assert.equal(extractArrivalLocationBarcode('LOC-A0101101'), 'A0101101');
  assert.equal(extractArrivalLocationBarcode('loc-A-01-01-1-01'), 'A0101101');
  const classified = classifyArrivalScan('LOC-A0101101', 'batch_sort');
  assert.equal(classified.kind, 'location');
  assert.equal(classified.locationBarcode, 'A0101101');
});

test('letter-fallback guesses (TBA tracking, bare names) are NOT locations', () => {
  assert.equal(extractArrivalLocationBarcode('TBA123456789012'), null);
  assert.equal(extractArrivalLocationBarcode('Overflow shelf'), null);
  assert.equal(classifyArrivalScan('TBA123456789012', 'batch_sort').kind, 'tracking');
  assert.equal(classifyArrivalScan('1Z999AA10123456784', 'batch_sort').kind, 'tracking');
});

test('carrier tracking stays tracking in both modes', () => {
  assert.equal(classifyArrivalScan('1Z999AA10123456784', 'default').kind, 'tracking');
  assert.equal(classifyArrivalScan('9400111899223344556677', 'batch_sort').kind, 'tracking');
});
