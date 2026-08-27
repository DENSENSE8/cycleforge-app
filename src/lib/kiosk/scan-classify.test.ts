/**
 *   npx tsx --test src/lib/kiosk/scan-classify.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyKioskScan,
  luhnValid,
  looksLikeImei,
  looksLikePickupRef,
  looksLikeUpcOrGtin,
} from './scan-classify';

describe('luhnValid', () => {
  it('accepts a known-good IMEI check digit', () => {
    // 490154203237518 — classic Luhn-valid IMEI used in docs.
    assert.equal(luhnValid('490154203237518'), true);
  });

  it('rejects a flipped check digit', () => {
    assert.equal(luhnValid('490154203237519'), false);
  });
});

describe('looksLikeImei', () => {
  it('requires 15 digits + Luhn', () => {
    assert.equal(looksLikeImei('490154203237518'), true);
    assert.equal(looksLikeImei('49015420323751'), false);
    assert.equal(looksLikeImei('123456789012345'), false);
  });
});

describe('looksLikeUpcOrGtin', () => {
  it('accepts 12-digit UPC and 8–14 digit GTIN, not 15-digit IMEI', () => {
    assert.equal(looksLikeUpcOrGtin('012345678905'), true);
    assert.equal(looksLikeUpcOrGtin('12345670'), true);
    assert.equal(looksLikeUpcOrGtin('490154203237518'), false);
  });
});

describe('looksLikePickupRef', () => {
  it('accepts RS# grammar and short numeric ticket ids', () => {
    assert.equal(looksLikePickupRef('RS-125'), true);
    assert.equal(looksLikePickupRef('RS125'), true);
    assert.equal(looksLikePickupRef('42'), false); // too short
    assert.equal(looksLikePickupRef('12345'), true);
    assert.equal(looksLikePickupRef('012345678905'), false); // UPC lane
  });
});

describe('classifyKioskScan', () => {
  it('routes IMEI / UPC / pickup / unknown', () => {
    assert.equal(classifyKioskScan('490154203237518').kind, 'imei');
    assert.equal(classifyKioskScan('012345678905').kind, 'upc');
    assert.equal(classifyKioskScan('RS-99').kind, 'pickup_ref');
    assert.equal(classifyKioskScan('hello').kind, 'unknown');
  });
});
