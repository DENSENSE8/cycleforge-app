import assert from 'node:assert/strict';
import test from 'node:test';
import { fbaConditionLabel } from './fba-conditions';

test('fbaConditionLabel omits house-grade prefixes from FNSKU label text', () => {
  assert.equal(fbaConditionLabel('A+ New'), 'New');
  assert.equal(fbaConditionLabel('A Used - Like New'), 'Used - Like New');
  assert.equal(fbaConditionLabel('B+ Used - Very Good'), 'Used - Very Good');
  assert.equal(fbaConditionLabel('B Used - Good'), 'Used - Good');
  assert.equal(fbaConditionLabel('C Used - Acceptable'), 'Used - Acceptable');
});

test('fbaConditionLabel preserves bare and unknown condition words', () => {
  assert.equal(fbaConditionLabel('Used - Very Good'), 'Used - Very Good');
  assert.equal(fbaConditionLabel('  B+ Seller Refurbished  '), 'Seller Refurbished');
  assert.equal(fbaConditionLabel(null), '');
});
