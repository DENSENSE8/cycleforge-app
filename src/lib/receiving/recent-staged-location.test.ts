import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatStagedLocationFace,
  stagedLocationButtonLabel,
  EMPTY_LOCATION_FACE,
  pickRecentStagedLocation,
  recentStagedLocationQueryKey,
  toStagedLocationFace,
  locationControlMenuState,
  type StagedLocationCandidate,
} from './recent-staged-location';

function cand(
  partial: Partial<StagedLocationCandidate> & { locationId: number; lineId: number },
): StagedLocationCandidate {
  return {
    receivingId: 10,
    stagedAt: '2026-08-18T10:00:00.000Z',
    stagedBy: 3,
    name: 'Bin A',
    barcode: 'A0101101',
    room: 'A',
    rowLabel: '01',
    colLabel: '01',
    ...partial,
  };
}

test('formatStagedLocationFace prefers barcode over room · name', () => {
  assert.equal(
    formatStagedLocationFace({ barcode: ' A0101101 ', name: 'Shelf', room: 'A' }),
    'A0101101',
  );
  assert.equal(
    formatStagedLocationFace({ barcode: '  ', name: 'Shelf', room: 'A' }),
    'A · Shelf',
  );
  assert.equal(formatStagedLocationFace({ name: 'Shelf', room: 'Shelf' }), 'Shelf');
  assert.equal(
    formatStagedLocationFace({ rowLabel: '02', colLabel: '3' }),
    '023',
  );
  assert.equal(formatStagedLocationFace({}), '');
});

test('stagedLocationButtonLabel uses the empty face when the bin is unknown', () => {
  assert.equal(stagedLocationButtonLabel({}), EMPTY_LOCATION_FACE);
  assert.equal(stagedLocationButtonLabel({ barcode: 'A0101101' }), 'A0101101');
});

test('pickRecentStagedLocation skips the open carton and prefers this operator', () => {
  const rows = [
    cand({ lineId: 1, receivingId: 99, stagedBy: 7, locationId: 1 }),
    cand({ lineId: 2, receivingId: 40, stagedBy: 3, locationId: 2, barcode: 'B2' }),
    cand({ lineId: 3, receivingId: 50, stagedBy: 9, locationId: 3, barcode: 'C3' }),
  ];
  const picked = pickRecentStagedLocation(rows, {
    excludeReceivingId: 99,
    staffId: 3,
  });
  assert.equal(picked?.locationId, 2);
  assert.equal(picked?.barcode, 'B2');
});

test('pickRecentStagedLocation falls back to newest eligible when staff has none', () => {
  const rows = [
    cand({ lineId: 1, receivingId: 99, stagedBy: 7, locationId: 1 }),
    cand({ lineId: 2, receivingId: 40, stagedBy: 9, locationId: 8, barcode: 'X' }),
  ];
  const picked = pickRecentStagedLocation(rows, {
    excludeReceivingId: 99,
    staffId: 3,
  });
  assert.equal(picked?.locationId, 8);
});

test('pickRecentStagedLocation ignores invalid location ids', () => {
  assert.equal(
    pickRecentStagedLocation([cand({ locationId: 0, lineId: 1 })]),
    null,
  );
});

test('toStagedLocationFace drops rows with no display label', () => {
  const labeled = toStagedLocationFace(cand({ locationId: 4, lineId: 9 }));
  assert.equal(labeled?.label, 'A0101101');
  assert.equal(
    toStagedLocationFace(
      cand({
        locationId: 4,
        lineId: 9,
        barcode: null,
        name: null,
        room: null,
        rowLabel: null,
        colLabel: null,
      }),
    ),
    null,
  );
});

test('recentStagedLocationQueryKey nests under receiving feed root', () => {
  assert.deepEqual(recentStagedLocationQueryKey(42), [
    'receiving',
    'recent-staged-location',
    42,
  ]);
  assert.deepEqual(recentStagedLocationQueryKey(null), [
    'receiving',
    'recent-staged-location',
    null,
  ]);
});

test('locationControlMenuState disables Last entry / Move until a last PO bin exists', () => {
  const empty = locationControlMenuState({ lastLabel: null, lastLocationId: null });
  assert.equal(empty.hasLast, false);
  assert.equal(empty.lastEntryLabel, 'Last entry');
  assert.match(empty.lastEntryTitle, /No recent location/);

  const ready = locationControlMenuState({
    lastLabel: 'A0101101',
    lastLocationId: 12,
  });
  assert.equal(ready.hasLast, true);
  assert.equal(ready.lastEntryLabel, 'Last entry · A0101101');
  assert.match(ready.moveTitle, /Move to A0101101/);
});
