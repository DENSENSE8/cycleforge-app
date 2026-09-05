/**
 *   node --import tsx --test src/lib/item-record/item-record-fork-absorb.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('carton contents and station PO lines use ItemRecordRow, not a contents fork', () => {
  assert.equal(
    existsSync('src/components/receiving/contents/ReceivingLineContentsRow.tsx'),
    false,
  );
  const carton = readFileSync(
    'src/components/receiving/inspector/inspection/CartonInspectionPage.tsx',
    'utf8',
  );
  assert.match(carton, /ItemRecordRow/);
  assert.match(carton, /receivingLinesToItemRecords/);
  assert.doesNotMatch(carton, /ReceivingLineContentsRow/);
  assert.doesNotMatch(carton, /ProgressBadge/);

  const station = readFileSync('src/components/station/receiving/PoLinesSection.tsx', 'utf8');
  assert.match(station, /ItemRecordRow/);
  assert.doesNotMatch(station, /function PoLineRow/);
  assert.doesNotMatch(station, /text-emerald-600/);
});
