/**
 * Carrier brand SoT — DisplayCarrier → brandHex resolution + hint ladder.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARRIER_BRANDS,
  carrierBrandDotPaint,
  displayCarrierFromHint,
  formatTrackingTooltipLabel,
  hasCarrierBrandPaint,
  resolveCarrierBrand,
  resolveDisplayCarrier,
} from './carrier-brand';

describe('carrier-brand', () => {
  it('UPS / FedEx / USPS / DHL carry native brand hex', () => {
    assert.equal(CARRIER_BRANDS.UPS.brandHex, '#351C15');
    assert.equal(CARRIER_BRANDS.FedEx.brandHex, '#4D148C');
    assert.equal(CARRIER_BRANDS.USPS.brandHex, '#4A9FE5');
    assert.equal(CARRIER_BRANDS.DHL.brandHex, '#FFCC00');
  });

  it('Unknown has no brand hex (house blue ring)', () => {
    assert.equal(CARRIER_BRANDS.Unknown.brandHex, null);
    assert.equal(hasCarrierBrandPaint(CARRIER_BRANDS.Unknown), false);
  });

  it('carrierBrandDotPaint uses brand hex; Unknown uses house blue', () => {
    assert.deepEqual(carrierBrandDotPaint(CARRIER_BRANDS.USPS), {
      style: { backgroundColor: '#4A9FE5' },
    });
    assert.deepEqual(carrierBrandDotPaint(CARRIER_BRANDS.Unknown), {
      className: 'bg-blue-500',
    });
  });

  it('displayCarrierFromHint maps stored labels', () => {
    assert.equal(displayCarrierFromHint('UPS'), 'UPS');
    assert.equal(displayCarrierFromHint('fedex ground'), 'FedEx');
    assert.equal(displayCarrierFromHint('USPS Priority'), 'USPS');
    assert.equal(displayCarrierFromHint(''), null);
    assert.equal(displayCarrierFromHint('MysteryCo'), null);
  });

  it('resolveDisplayCarrier prefers hint over pattern detect', () => {
    // 1Z… is UPS; hint FedEx must win (label/STN is authoritative for Open + paint).
    assert.equal(resolveDisplayCarrier('1Z999AA10123456784', 'FedEx'), 'FedEx');
    assert.equal(resolveDisplayCarrier('1Z999AA10123456784', null), 'UPS');
  });

  it('resolveCarrierBrand returns paint for known carriers', () => {
    const ups = resolveCarrierBrand('1Z999AA10123456784');
    assert.equal(ups.carrier, 'UPS');
    assert.ok(hasCarrierBrandPaint(ups));
    // 8-prefixed Express STN — pattern detect (not only [39] folklore).
    const fedex8 = resolveCarrierBrand('875230873543');
    assert.equal(fedex8.carrier, 'FedEx');
    assert.ok(hasCarrierBrandPaint(fedex8));
    const unknown = resolveCarrierBrand('not-a-tracking');
    assert.equal(unknown.carrier, 'Unknown');
    assert.equal(hasCarrierBrandPaint(unknown), false);
  });

  it('formatTrackingTooltipLabel prefixes known carrier; unknown stays bare', () => {
    assert.equal(
      formatTrackingTooltipLabel('1Z999AA10123456784'),
      'UPS 1Z999AA10123456784',
    );
    // Pattern detect alone — no carrierHint required for 8-prefixed Express.
    assert.equal(
      formatTrackingTooltipLabel('875230873543'),
      'FedEx 875230873543',
    );
    assert.equal(
      formatTrackingTooltipLabel('875114550512', 'FedEx'),
      'FedEx 875114550512',
    );
    assert.equal(formatTrackingTooltipLabel('not-a-tracking'), 'not-a-tracking');
    assert.equal(formatTrackingTooltipLabel(''), '');
  });
});

