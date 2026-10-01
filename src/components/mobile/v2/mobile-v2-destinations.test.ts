import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOBILE_V2_DESTINATIONS,
  MOBILE_V2_FULFILLMENT_DESTINATIONS,
} from './mobile-v2-destinations';

describe('Mobile V2 navigation contract', () => {
  it('keeps the Fulfillment hierarchy aligned with desktop', () => {
    assert.deepEqual(
      MOBILE_V2_FULFILLMENT_DESTINATIONS.map(({ id, label }) => ({ id, label })),
      [
        { id: 'fulfilled', label: 'Fulfilled' },
        { id: 'fbm', label: 'FBM' },
        { id: 'fba', label: 'FBA' },
        { id: 'label-intake', label: 'Labels & docs' },
      ],
    );
    assert.equal(MOBILE_V2_FULFILLMENT_DESTINATIONS.find(({ id }) => id === 'fbm')?.ported, undefined);
    assert.ok(
      MOBILE_V2_FULFILLMENT_DESTINATIONS
        .filter(({ id }) => id !== 'fbm')
        .every(({ ported }) => ported === false),
    );
  });

  it('has one Stock destination and no Products fork', () => {
    const ids = MOBILE_V2_DESTINATIONS.map(({ id }) => id);
    assert.equal(ids.filter((id) => id === 'stock').length, 1);
    assert.equal(ids.includes('scan-adjust'), false);
    assert.equal(ids.includes('products'), false);
  });
});
