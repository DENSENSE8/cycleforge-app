/**
 * The replacement form's rate shop: which rates show under which chips, in
 * what order, and what the operator copies to the buyer afterwards.
 * Run: npx tsx --test src/lib/shipping/replacement-rate-shop.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carrierFacets,
  includedCoverageUsd,
  ozToLbText,
  parcelComplete,
  rateArrival,
  replacementTrackingEmail,
  shopRates,
  type CoverageFilter,
  type RateSort,
} from './replacement-rate-shop';
import type { ShippingRateOption } from './shipstation/types';

const rate = (o: Partial<ShippingRateOption> & Pick<ShippingRateOption, 'rateId' | 'amount'>): ShippingRateOption => ({
  carrierId: 'se-1',
  carrierCode: 'stamps_com',
  carrierName: 'USPS',
  serviceCode: 'usps_ground_advantage',
  serviceName: 'USPS Ground Advantage',
  currency: 'USD',
  deliveryDays: 5,
  ...o,
});

const RATES = [
  rate({ rateId: 'ga', amount: 7.1, otherAmount: 0.5 }),
  rate({ rateId: 'pm', amount: 9.4, carrierCode: 'usps', serviceCode: 'usps_priority_mail', deliveryDays: 2 }),
  rate({ rateId: 'media', amount: 4.2, serviceCode: 'usps_media_mail', deliveryDays: null }),
  rate({ rateId: 'upsg', amount: 7.6, carrierId: 'se-9', carrierCode: 'ups', carrierName: 'UPS', serviceCode: 'ups_ground', deliveryDays: 3 }),
  rate({ rateId: 'fx2', amount: 22, carrierId: 'se-7', carrierCode: 'fedex', carrierName: 'FedEx', serviceCode: 'fedex_2day', deliveryDays: 2 }),
  rate({ rateId: 'ontrac', amount: 6.9, carrierId: 'se-5', carrierCode: 'ontrac', carrierName: 'OnTrac', serviceCode: 'ontrac_ground', deliveryDays: null }),
];

const ids = (rs: readonly ShippingRateOption[]) => rs.map((r) => r.rateId);
const shop = (o: { carriers?: string[]; sort?: RateSort; coverage?: CoverageFilter } = {}) =>
  ids(shopRates(RATES, { carriers: new Set(o.carriers ?? []), sort: o.sort ?? 'cheapest', coverage: o.coverage ?? 'any' }));

test('facets: one chip per carrier with counts, USPS account codes folded together, first-seen order', () => {
  assert.deepEqual(carrierFacets(RATES), [
    { key: 'usps', label: 'USPS', count: 3 },
    { key: 'ups', label: 'UPS', count: 1 },
    { key: 'fedex', label: 'FedEx', count: 1 },
    { key: 'ontrac', label: 'OnTrac', count: 1 },
  ]);
});

test('carrier filter: no chip selected shows every rate; several chips show their union', () => {
  assert.equal(shop().length, RATES.length);
  assert.deepEqual(shop({ carriers: ['ups'] }), ['upsg']);
  assert.deepEqual(shop({ carriers: ['usps', 'fedex'] }), ['media', 'ga', 'pm', 'fx2']);
});

test('sort: cheapest and most expensive go by total (shipping + surcharges)', () => {
  assert.deepEqual(shop({ sort: 'cheapest' }), ['media', 'ontrac', 'upsg', 'ga', 'pm', 'fx2'], 'equal totals → the faster first');
  assert.deepEqual(shop({ sort: 'priciest' }), ['fx2', 'pm', 'upsg', 'ga', 'ontrac', 'media']);
});

test('sort: fastest goes by delivery days, ties to the cheaper, unknown days last', () => {
  assert.deepEqual(shop({ sort: 'fastest' }), ['pm', 'fx2', 'upsg', 'ga', 'media', 'ontrac']);
});

test('coverage: carrier-included coverage filters both ways', () => {
  assert.equal(includedCoverageUsd({ carrierCode: 'stamps_com', serviceCode: 'usps_priority_mail' }), 100);
  assert.equal(includedCoverageUsd({ carrierCode: 'usps', serviceCode: 'usps_media_mail' }), null);
  assert.deepEqual(shop({ coverage: 'includes_coverage' }), ['upsg', 'ga', 'pm', 'fx2']);
  assert.deepEqual(shop({ coverage: 'no_coverage' }), ['media', 'ontrac']);
});

test('parcel: complete only when weight and all three dimensions are positive numbers', () => {
  const full = { weightOz: 12, length: 10, width: 8, height: 4 };
  assert.equal(parcelComplete(full), true);
  assert.equal(parcelComplete({ ...full, weightOz: 0 }), false);
  assert.equal(parcelComplete({ ...full, length: -1 }), false);
  assert.equal(parcelComplete({ ...full, width: Number.NaN }), false);
  assert.equal(parcelComplete({ ...full, height: null }), false);
  assert.equal(parcelComplete({ ...full, weightOz: 0.1 }), true);
});

test('weight readout: ounces as pounds to two decimals, trailing zeros dropped', () => {
  assert.equal(ozToLbText(52), '3.25 lb');
  assert.equal(ozToLbText(48), '3 lb');
  assert.equal(ozToLbText(8), '0.5 lb');
  assert.equal(ozToLbText(10), '0.63 lb');
  assert.equal(ozToLbText(5), '0.31 lb');
});

test('arrival: the carrier estimate wins; else today + delivery days; else unknown', () => {
  const now = new Date('2026-10-08T18:00:00Z');
  assert.equal(rateArrival(rate({ rateId: 'e', amount: 1, estimatedDeliveryDate: '2026-10-10T00:00:00Z', deliveryDays: 5 }), now), '2026-10-10');
  assert.equal(rateArrival(rate({ rateId: 'd', amount: 1, deliveryDays: 3 }), now), '2026-10-11');
  assert.equal(rateArrival(rate({ rateId: 'n', amount: 1, deliveryDays: null }), now), null);
});

test('buyer email: full tracking number, order, carrier, link, and a reason-aware opening', () => {
  const base = {
    buyerName: 'Jane Rider',
    orderNumber: '112-7788-1234',
    carrierName: 'USPS',
    trackingNumber: '9400111899223197428490',
    trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490',
  };
  const lost = replacementTrackingEmail({ ...base, reason: 'lost' });
  assert.match(lost.subject, /112-7788-1234/);
  assert.match(lost.body, /^Hi Jane,/);
  assert.match(lost.body, /Sorry your package went missing/);
  assert.ok(lost.body.includes('9400111899223197428490'));
  assert.ok(lost.body.includes('112-7788-1234'));
  assert.ok(lost.body.includes('USPS'));
  assert.ok(lost.body.includes(base.trackingUrl));

  assert.match(replacementTrackingEmail({ ...base, reason: 'damaged' }).body, /damaged/);
  assert.match(replacementTrackingEmail({ ...base, reason: 'wrong_item' }).body, /wrong item/);

  const neutral = replacementTrackingEmail({ ...base, buyerName: null, trackingUrl: null, reason: null });
  assert.match(neutral.body, /^Hi there,/);
  assert.doesNotMatch(neutral.body, /Sorry/);
  assert.doesNotMatch(neutral.body, /Track it here/);
  assert.ok(neutral.body.includes('9400111899223197428490'));
});
