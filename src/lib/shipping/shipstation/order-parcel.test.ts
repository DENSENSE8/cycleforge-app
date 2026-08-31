import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveOrderRateParcel } from '@/lib/shipping/shipstation/order-parcel';

const NO_STORED = { weightOz: null, lengthIn: null, widthIn: null, heightIn: null };

describe('resolveOrderRateParcel', () => {
  it('round-trips body weight + L×W×H inch into ShipmentSpec parcel shape', () => {
    const parcel = resolveOrderRateParcel({
      stored: NO_STORED,
      bodyWeightOz: 18,
      bodyDimensions: { length: 12, width: 9, height: 4, unit: 'inch' },
    });
    assert.deepEqual(parcel, {
      weight: { value: 18, unit: 'ounce' },
      dimensions: { length: 12, width: 9, height: 4, unit: 'inch' },
    });
  });

  it('uses the parcel stored on the order when the body has none', () => {
    const parcel = resolveOrderRateParcel({
      stored: { weightOz: 32, lengthIn: 10, widthIn: 8, heightIn: 6 },
    });
    assert.deepEqual(parcel, {
      weight: { value: 32, unit: 'ounce' },
      dimensions: { length: 10, width: 8, height: 6, unit: 'inch' },
    });
  });

  it('body values win over stored values', () => {
    const parcel = resolveOrderRateParcel({
      stored: { weightOz: 32, lengthIn: 10, widthIn: 8, heightIn: 6 },
      bodyWeightOz: 20,
      bodyDimensions: { length: 5, width: 5, height: 5, unit: 'centimeter' },
    });
    assert.equal(parcel?.weight.value, 20);
    assert.equal(parcel?.dimensions?.unit, 'centimeter');
    assert.equal(parcel?.dimensions?.length, 5);
  });

  it('falls back to the engine weight when nothing local exists', () => {
    const parcel = resolveOrderRateParcel({
      stored: NO_STORED,
      fallbackWeight: { value: 2, unit: 'pound' },
    });
    assert.deepEqual(parcel, { weight: { value: 2, unit: 'pound' } });
  });

  it('refuses to build a parcel with no weight from any source', () => {
    assert.equal(resolveOrderRateParcel({ stored: NO_STORED }), null);
    // Dimensions alone never make a rateable parcel.
    assert.equal(
      resolveOrderRateParcel({
        stored: { weightOz: null, lengthIn: 10, widthIn: 8, heightIn: 6 },
      }),
      null,
    );
  });

  it('drops an incomplete stored dimension trio instead of quoting two sides of a box', () => {
    const parcel = resolveOrderRateParcel({
      stored: { weightOz: 16, lengthIn: 10, widthIn: null, heightIn: 6 },
    });
    assert.deepEqual(parcel, { weight: { value: 16, unit: 'ounce' } });
  });

  it('ignores a non-positive body weight in favor of the stored one', () => {
    const parcel = resolveOrderRateParcel({
      stored: { weightOz: 16, lengthIn: null, widthIn: null, heightIn: null },
      bodyWeightOz: 0,
    });
    assert.equal(parcel?.weight.value, 16);
  });
});
