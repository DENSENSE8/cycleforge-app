/**
 * The chat's label words → numbers / one rate. A wrong parse buys the wrong
 * parcel or the wrong service, so the edges are pinned here.
 * Run: npx tsx --test src/lib/shipping/label-rate-choice.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRate, markRates, parseParcelDimensions, parseParcelWeightOz, rateTotal } from './label-rate-choice';
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
  rate({ rateId: 'pm', amount: 9.4, serviceCode: 'usps_priority_mail', serviceName: 'USPS Priority Mail', deliveryDays: 2 }),
  rate({ rateId: 'pme', amount: 31, serviceCode: 'usps_priority_mail_express', serviceName: 'USPS Priority Mail Express', deliveryDays: 1 }),
  rate({ rateId: 'upsg', amount: 7.6, carrierId: 'se-9', carrierCode: 'ups', carrierName: 'UPS', serviceCode: 'ups_ground', serviceName: 'UPS Ground', deliveryDays: 3 }),
];

test('weight: units convert to ounces, compound weights add, a bare number is refused', () => {
  assert.equal(parseParcelWeightOz('2 lb'), 32);
  assert.equal(parseParcelWeightOz('2lb 4oz'), 36);
  assert.equal(parseParcelWeightOz('20 oz'), 20);
  assert.equal(parseParcelWeightOz('1.5 pounds'), 24);
  assert.equal(parseParcelWeightOz('1 kg'), 35.27);
  assert.equal(parseParcelWeightOz('2'), null, 'pounds or ounces is ambiguous — ask');
  assert.equal(parseParcelWeightOz('0 oz'), null);
});

test('dimensions: L×W×H in inches unless centimetres are said', () => {
  assert.deepEqual(parseParcelDimensions('12x10x4'), { length: 12, width: 10, height: 4, unit: 'inch' });
  assert.deepEqual(parseParcelDimensions('12 × 10 × 4.5 in'), { length: 12, width: 10, height: 4.5, unit: 'inch' });
  assert.deepEqual(parseParcelDimensions('30x20x10 cm'), { length: 30, width: 20, height: 10, unit: 'centimeter' });
  assert.equal(parseParcelDimensions('12x10'), null);
});

test('marks: cheapest by the total charged (surcharges included), fastest by days with ties → cheaper', () => {
  assert.equal(rateTotal(RATES[0]), 7.6);
  // GA totals 7.60 = UPS Ground 7.60; the first seen stays cheapest.
  assert.deepEqual(markRates(RATES), { cheapest: 'ga', fastest: 'pme' });
  const tie = [rate({ rateId: 'a', amount: 20, deliveryDays: 1 }), rate({ rateId: 'b', amount: 12, deliveryDays: 1 })];
  assert.equal(markRates(tie).fastest, 'b');
  assert.equal(markRates([rate({ rateId: 'x', amount: 5, deliveryDays: null })]).fastest, null);
});

test('choice: cheapest / fastest / service words pick exactly one rate', () => {
  const pick = (said: string) => {
    const c = chooseRate(RATES, said);
    return c.ok ? c.rate.rateId : c.reason;
  };
  assert.equal(pick('the cheapest'), 'ga');
  assert.equal(pick('fastest one'), 'pme');
  assert.equal(pick('UPS Ground'), 'upsg');
  assert.equal(pick('usps_priority_mail'), 'pm', 'an exact service code wins over the Express prefix match');
  assert.equal(pick('USPS Priority Mail Express'), 'pme');
  assert.equal(pick('priority'), 'ambiguous', 'Priority Mail vs Priority Mail Express — ask');
  assert.equal(pick('fedex'), 'no_match');
  assert.equal(chooseRate([], 'cheapest').ok, false);
});
