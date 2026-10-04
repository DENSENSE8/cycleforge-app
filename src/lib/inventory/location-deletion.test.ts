import assert from 'node:assert/strict';
import test from 'node:test';
import {
  locationDeleteFace,
  locationHierarchy,
  locationMatchesDeleteScope,
} from './location-deletion';

const row = {
  id: 31,
  barcode: 'C0203104',
  room: 'Zone 3 - Parts',
  row_label: '02-03',
  col_label: '1-04',
};

test('locationHierarchy resolves the exact zone/aisle/bay/level/position', () => {
  assert.deepEqual(locationHierarchy(row), { zone: 'C', aisle: 2, bay: 3, level: 1, position: 4 });
});

test('location scope distinguishes aisle, bay and position', () => {
  assert.equal(locationMatchesDeleteScope(row, { room: 'Zone 3 - Parts', aisle: 2 }), true);
  assert.equal(locationMatchesDeleteScope(row, { room: 'Zone 3 - Parts', aisle: 1 }), false);
  assert.equal(locationMatchesDeleteScope(row, { room: 'Zone 3 - Parts', aisle: 2, bay: 3, position: 4 }), true);
  assert.equal(locationMatchesDeleteScope(row, { room: 'Zone 3 - Parts', aisle: 2, bay: 4 }), false);
});

test('rack sentinel is explicitly labeled as rack level', () => {
  assert.equal(locationDeleteFace({ ...row, barcode: 'C0203100', col_label: '1-00' }), 'C-02-03-1 · rack level');
});
