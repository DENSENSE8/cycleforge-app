import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldFallbackToGeneratedPackingSlip } from './marketplace-fetch-policy';

test('ECWID packing-slip failures remain provider failures', () => {
  assert.equal(shouldFallbackToGeneratedPackingSlip('ecwid', 'packing_slip'), false);
});

test('other marketplace packing-slip adapters retain the generated fallback', () => {
  assert.equal(shouldFallbackToGeneratedPackingSlip('ebay', 'packing_slip'), true);
  assert.equal(shouldFallbackToGeneratedPackingSlip('amazon', 'packing_slip'), true);
});

test('shipping labels never fall back to generated documents', () => {
  assert.equal(shouldFallbackToGeneratedPackingSlip('ecwid', 'shipping_label'), false);
  assert.equal(shouldFallbackToGeneratedPackingSlip('ebay', 'shipping_label'), false);
});
