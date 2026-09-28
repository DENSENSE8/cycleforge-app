import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addressCheckKey,
  mapValidateAddressesResponse,
  normalizeCountryCode,
  shipAddressFromBook,
} from './address-validation';
import type { ShipAddress } from './types';

const original: ShipAddress = {
  name: 'Ada Buyer',
  phone: '555-0100',
  company: null,
  addressLine1: '1 main street',
  addressLine2: 'apt 4',
  cityLocality: 'austin',
  stateProvince: 'tx',
  postalCode: '78701',
  countryCode: 'US',
  residential: null,
};

describe('mapValidateAddressesResponse', () => {
  it('maps a verified entry with its standardized address, keeping the caller contact', () => {
    const [result] = mapValidateAddressesResponse(
      [
        {
          status: 'verified',
          original_address: {},
          matched_address: {
            name: null,
            phone: null,
            address_line1: '1 MAIN ST',
            address_line2: 'APT 4',
            address_line3: null,
            city_locality: 'AUSTIN',
            state_province: 'TX',
            postal_code: '78701-1234',
            country_code: 'us',
            address_residential_indicator: 'yes',
          },
          messages: [],
        },
      ],
      [original],
    );
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.messages, []);
    assert.deepEqual(result.matched, {
      name: 'Ada Buyer',
      phone: '555-0100',
      company: null,
      addressLine1: '1 MAIN ST',
      addressLine2: 'APT 4',
      cityLocality: 'AUSTIN',
      stateProvince: 'TX',
      postalCode: '78701-1234',
      countryCode: 'US',
      residential: true,
    });
  });

  it('collects distinct non-blank messages and reads a missing matched address as null', () => {
    const [result] = mapValidateAddressesResponse(
      [
        {
          status: 'Warning',
          matched_address: null,
          messages: [
            { code: 'a1004', message: 'Secondary number is missing.', type: 'warning' },
            { code: 'a1004', message: 'Secondary number is missing.', type: 'warning' },
            { code: 'x', message: '  ', type: 'info' },
          ],
        },
      ],
      [original],
    );
    assert.equal(result.status, 'warning');
    assert.equal(result.matched, null);
    assert.deepEqual(result.messages, ['Secondary number is missing.']);
  });

  it('treats an unknown status as error, never as verified', () => {
    const [result] = mapValidateAddressesResponse([{ status: 'maybe', messages: null }], [original]);
    assert.equal(result.status, 'error');
  });

  it('drops a matched address without a street or city', () => {
    const [result] = mapValidateAddressesResponse(
      [{ status: 'error', matched_address: { address_line1: '', city_locality: 'AUSTIN' } }],
      [original],
    );
    assert.equal(result.matched, null);
  });

  it('rejects a response that is not a validation array', () => {
    assert.throws(() => mapValidateAddressesResponse({ errors: [] }, [original]));
  });
});

describe('addressCheckKey', () => {
  it('ignores contact fields, case and extra whitespace', () => {
    const variant: ShipAddress = { ...original, name: 'Someone Else', phone: null, addressLine1: '  1  MAIN street ' };
    assert.equal(addressCheckKey(variant), addressCheckKey(original));
  });
  it('differs when a postal line differs', () => {
    assert.notEqual(addressCheckKey({ ...original, addressLine2: 'apt 5' }), addressCheckKey(original));
  });
});

describe('normalizeCountryCode / shipAddressFromBook', () => {
  it('reads codes, common names and blanks', () => {
    assert.equal(normalizeCountryCode('us'), 'US');
    assert.equal(normalizeCountryCode('United States'), 'US');
    assert.equal(normalizeCountryCode(null), 'US');
    assert.equal(normalizeCountryCode('Freedonia'), null);
  });
  it('needs a street, a city and a readable country', () => {
    const book = {
      name: '',
      address1: '1 Main St',
      address2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'USA',
    };
    assert.equal(shipAddressFromBook(book)?.countryCode, 'US');
    assert.equal(shipAddressFromBook(book)?.name, 'Customer');
    assert.equal(shipAddressFromBook({ ...book, city: ' ' }), null);
    assert.equal(shipAddressFromBook({ ...book, country: 'Freedonia' }), null);
  });
});
