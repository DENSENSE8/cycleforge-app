import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGs1AiPayload, pickAiRoutingValue, serialFragmentPatterns } from './scan-resolver';

const GS = '\x1D';
/** A real GTIN-14 (UPC-A 012345678905, zero-padded); its check digit is valid. */
const GTIN = '00012345678905';
const BAD_GTIN = '00012345678906';

test('order numbers, SKUs, UPCs and bare GTIN-14s are not GS1 element strings', () => {
  for (const value of [
    '113-1528493-1234567', // Amazon 3-7-7 — once parsed as AI 11
    '11-15067-72584', // eBay 2-5-5
    '112233445566', // eBay compact / FedEx-12 shape
    '00096', // numeric SKU — once parsed as AI 00
    '001234567890', // UPC-A with leading zeros
    '02000123456789', // bare GTIN-14 — AI 02 would need 14 more digits
    '4993', // short numeric
    '1Z999AA10123456784',
  ]) {
    assert.equal(parseGs1AiPayload(value), null, value);
  }
});

test('parenthesised element strings parse every AI', () => {
  assert.deepEqual(parseGs1AiPayload(`(01)${GTIN}(21)SN123(10)LOT7`)?.ais, {
    '01': GTIN,
    '21': 'SN123',
    '10': 'LOT7',
  });
});

test('a wrong GTIN check digit rejects the payload even in explicit form', () => {
  assert.equal(parseGs1AiPayload(`(01)${BAD_GTIN}(21)SN123`), null);
  assert.equal(parseGs1AiPayload(`01${BAD_GTIN}21SN123`), null);
});

test('text before the first AI is not an element string', () => {
  assert.equal(parseGs1AiPayload(`lot (01)${GTIN}`), null);
});

test('FNC1-separated payloads parse variable-length AIs up to the separator', () => {
  assert.deepEqual(parseGs1AiPayload(`01${GTIN}21SN1${GS}10LOT7`)?.ais, {
    '01': GTIN,
    '21': 'SN1',
    '10': 'LOT7',
  });
});

test('a bare digit string is GS1 only when it opens with a valid key and parses to the end', () => {
  assert.deepEqual(parseGs1AiPayload(`01${GTIN}21SN1`)?.ais, { '01': GTIN, '21': 'SN1' });
  // Valid key, but the remainder is not AI-encoded.
  assert.equal(parseGs1AiPayload(`01${GTIN}99`), null);
});

test('a GS1 symbology identifier declares the payload explicitly', () => {
  assert.deepEqual(parseGs1AiPayload(`]d2${'17'}261231${GS}01${GTIN}`)?.ais, {
    '17': '261231',
    '01': GTIN,
  });
  // Without the declaration a date-led digit string is not GS1.
  assert.equal(parseGs1AiPayload(`17261231`), null);
});

test('impossible dates and over-long variable values are rejected', () => {
  assert.equal(parseGs1AiPayload(`(01)${GTIN}(17)261399`), null);
  assert.equal(parseGs1AiPayload(`(01)${GTIN}(21)${'X'.repeat(21)}`), null);
});

test('routing still prefers the serial over the GTIN', () => {
  const tree = parseGs1AiPayload(`(01)${GTIN}(21)SN123`);
  assert.ok(tree);
  assert.deepEqual(pickAiRoutingValue(tree), { kind: 'serial', value: 'SN123' });
});

test('short numbers and words never become serial fragment searches', () => {
  for (const value of ['4993', 'BOSE', 'SOUNDLINK', 'AB12']) {
    assert.deepEqual(serialFragmentPatterns(value), [], value);
  }
});

test('a serial-looking fragment gets suffix, then contains only when it mixes letters and digits', () => {
  assert.deepEqual(serialFragmentPatterns('F90290'), ['%F90290', '%F90290%']);
  assert.deepEqual(serialFragmentPatterns('902901'), ['%902901']);
  // Long fragments are tails, not middles.
  assert.deepEqual(serialFragmentPatterns('071494F90290'), ['%071494F90290']);
});
