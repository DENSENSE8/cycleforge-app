/**
 * Arrival open-carton scan split — the DB-free half of "scan a shelf, place the
 * carton in front of me".
 *
 * The regression this pins is the whole reason the split exists: a shelf places
 * the open carton, and EVERYTHING else (Amazon `TBA…` above all) still falls
 * through to tracking ingest unchanged.
 *
 * Run: `npx tsx --test src/lib/receiving/arrival-carton-scan.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyArrivalCartonScan,
  findLocationByBarcode,
} from './arrival-carton-scan';
import type { Location } from '@/lib/neon/location-queries';

function loc(partial: Partial<Location> & { id: number }): Location {
  return {
    name: `Shelf ${partial.id}`,
    room: null,
    description: null,
    barcode: null,
    is_active: true,
    sort_order: 0,
    row_label: '01',
    col_label: '01',
    bin_type: null,
    capacity: null,
    parent_id: null,
    zone_letter: null,
    ...partial,
  };
}

test('a flat shelf code is a placement commit — no batch_sort session needed', () => {
  const result = classifyArrivalCartonScan('A0101101');
  assert.equal(result.kind, 'location');
  assert.equal(
    result.kind === 'location' ? result.locationBarcode : null,
    'A0101101',
  );
});

test('dashed + LOC- prefixed forms unwrap to the same flat barcode', () => {
  const dashed = classifyArrivalCartonScan('A-01-01-1-01');
  assert.equal(dashed.kind, 'location');
  assert.equal(dashed.kind === 'location' ? dashed.locationBarcode : null, 'A0101101');

  const prefixed = classifyArrivalCartonScan('LOC-A0101101');
  assert.equal(prefixed.kind, 'location');
  assert.equal(
    prefixed.kind === 'location' ? prefixed.locationBarcode : null,
    'A0101101',
  );
});

test('an Amazon TBA tracking is NEVER a shelf — it falls through to tracking', () => {
  const result = classifyArrivalCartonScan('TBA123456789012');
  assert.equal(result.kind, 'tracking');
  assert.equal(result.raw, 'TBA123456789012');
});

test('carrier trackings fall through to tracking ingest', () => {
  assert.equal(classifyArrivalCartonScan('1Z999AA10123456784').kind, 'tracking');
  assert.equal(classifyArrivalCartonScan('9400111899223344556677').kind, 'tracking');
});

test('a bare shelf NAME is not a confident decode — stays tracking', () => {
  assert.equal(classifyArrivalCartonScan('Overflow shelf').kind, 'tracking');
});

test('empty / whitespace is tracking with an empty raw (caller no-ops)', () => {
  assert.equal(classifyArrivalCartonScan('   ').kind, 'tracking');
  assert.equal(classifyArrivalCartonScan('   ').raw, '');
});

test('the raw payload survives classification for the ingest hand-back', () => {
  const result = classifyArrivalCartonScan('  1Z999AA10123456784  ');
  assert.equal(result.raw, '1Z999AA10123456784');
});

test('findLocationByBarcode matches case-insensitively on the catalog in hand', () => {
  const locations = [
    loc({ id: 7, barcode: 'A0101101', name: 'A-01-01-1-01' }),
    loc({ id: 9, barcode: 'B0202202' }),
  ];
  assert.equal(findLocationByBarcode('a0101101', locations)?.id, 7);
  assert.equal(findLocationByBarcode('  B0202202 ', locations)?.id, 9);
});

test('findLocationByBarcode returns null when the catalog does not carry it', () => {
  // Null is the signal to resolve authoritatively through the API — never a
  // silent no-op, and never a guess at a neighbouring shelf.
  assert.equal(findLocationByBarcode('Z9999999', [loc({ id: 1, barcode: 'A01' })]), null);
  assert.equal(findLocationByBarcode('', [loc({ id: 1, barcode: 'A01' })]), null);
  assert.equal(findLocationByBarcode('A01', [loc({ id: 1, barcode: null })]), null);
});
