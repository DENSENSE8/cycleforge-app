import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNKNOWN_CARRIER,
  normalizeCarrierToken,
  resolveStoredCarrier,
  shipStationCarrierToStored,
  toStoredCarrier,
} from '@/lib/shipping/carrier-resolution';
import { isCarrierSyncEnabled } from '@/lib/shipping/enabled-carriers';

describe('resolveStoredCarrier', () => {
  it('names a carrier the stored column called UNKNOWN', () => {
    // 410 FedEx + 506 USPS rows on the lane DB were stored UNKNOWN, so the
    // sweep skipped them and they could never hold a status.
    const fedex = resolveStoredCarrier({ tracking: '873846671364', reported: 'UNKNOWN' });
    assert.equal(fedex.carrier, 'FEDEX');
    assert.equal(fedex.source, 'detected');
    assert.equal(fedex.conflict, false);

    const ups = resolveStoredCarrier({ tracking: '1Z999AA10123456784', reported: null });
    assert.equal(ups.carrier, 'UPS');
  });

  it('keeps the reported carrier and RAISES a conflict when they disagree', () => {
    // LX088692799IL is stored USPS but reads as UPU international: USPS Track
    // will 404 it forever. Picking a side silently is the bug; surfacing it is
    // the fix.
    const r = resolveStoredCarrier({ tracking: 'LX088692799IL', reported: 'USPS' });
    assert.equal(r.conflict, true);
    assert.equal(r.carrier, 'USPS', 'a vendor claim is not overwritten by a guess');
    assert.equal(r.detected, 'UPU_INTL');
  });

  it('falls back to the reported word when the pattern list is silent', () => {
    const r = resolveStoredCarrier({ tracking: 'LOCAL-01618-1776105096827-2VH5', reported: 'local' });
    assert.equal(r.carrier, 'LOCAL');
    assert.equal(r.source, 'reported');
    assert.equal(r.detected, null);
  });

  it('is UNKNOWN only when neither source names anything', () => {
    const r = resolveStoredCarrier({ tracking: '078182t41342181a2', reported: '' });
    assert.equal(r.carrier, UNKNOWN_CARRIER);
    assert.equal(r.source, 'unknown');
  });

  it('always returns an uppercase token — the column is constrained to it', () => {
    const r = resolveStoredCarrier({ tracking: 'nonsense-value', reported: ' fed ex ' });
    assert.equal(r.carrier, r.carrier.toUpperCase());
    assert.equal(r.carrier, 'FEDEX');
  });

  it('collapses UPS Mail Innovations onto UPS — same API tracks it', () => {
    assert.equal(toStoredCarrier('UPS_MI'), 'UPS');
    assert.equal(toStoredCarrier('DHL_EXPRESS'), 'DHL_EXPRESS');
    assert.equal(toStoredCarrier(null), UNKNOWN_CARRIER);
  });

  it('strips punctuation and case from a claimed token', () => {
    assert.equal(normalizeCarrierToken(' u-p-s '), 'UPS');
    assert.equal(normalizeCarrierToken(null), '');
  });
});

describe('isCarrierSyncEnabled', () => {
  it('accepts a carrier whatever its spelling', () => {
    // A lowercase `usps` row fell out of every sweep silently. Case is a
    // spelling, not a carrier.
    assert.equal(isCarrierSyncEnabled('UPS'), true);
    assert.equal(isCarrierSyncEnabled('ups'), true);
    assert.equal(isCarrierSyncEnabled(' FedEx '), true);
  });

  it('still refuses carriers with no live integration', () => {
    assert.equal(isCarrierSyncEnabled('USPS'), false, 'disabled pending the USPS IP Agreement');
    assert.equal(isCarrierSyncEnabled('AMAZON'), false);
    assert.equal(isCarrierSyncEnabled('UNKNOWN'), false);
    assert.equal(isCarrierSyncEnabled(''), false);
    assert.equal(isCarrierSyncEnabled(null), false);
  });
});

describe('shipStationCarrierToStored', () => {
  it('shipStationCarrierToStored: account codes map to the carrier that moves the parcel', () => {
    assert.equal(shipStationCarrierToStored('stamps_com'), 'USPS');
    assert.equal(shipStationCarrierToStored('usps'), 'USPS');
    assert.equal(shipStationCarrierToStored('ups_walleted'), 'UPS');
    assert.equal(shipStationCarrierToStored('fedex'), 'FEDEX');
    assert.equal(shipStationCarrierToStored('dhl_express_worldwide'), 'DHL_EXPRESS');
    assert.equal(shipStationCarrierToStored('ontrac'), 'ONTRAC');
  });

  it('shipStationCarrierToStored: unknown codes report nothing (the detector decides)', () => {
    assert.equal(shipStationCarrierToStored('some_regional_courier'), null);
    assert.equal(shipStationCarrierToStored(''), null);
    assert.equal(shipStationCarrierToStored(null), null);
  });

  it('a Stamps.com label on a USPS number resolves USPS with no conflict', () => {
    const r = resolveStoredCarrier({
      tracking: '9400111899223197428490',
      reported: shipStationCarrierToStored('stamps_com'),
    });
    assert.equal(r.carrier, 'USPS');
    assert.equal(r.conflict, false);
  });
});
