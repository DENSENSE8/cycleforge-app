/**
 * In-person tender — card FACTS only. A PAN-shaped value anywhere in the
 * payment text is refused; last 4 is exactly four digits.
 * Run: npx tsx --test src/lib/order-payments/tender.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAN_REFUSAL, isCardLast4, looksLikePan, parseInPersonTender, tenderSummary } from './tender';

test('a PAN is caught however it is typed; references and auth codes are not', () => {
  for (const pan of ['4111111111111111', '4111 1111 1111 1111', '4111-1111-1111-1111', '5500.0000.0000.0004', 'card 378282246310005 ok', '6011000990139424123']) {
    assert.equal(looksLikePan(pan), true, pan);
  }
  // 12 digits is a long reference, not a card; letters break a run.
  for (const fine of ['', 'AUTH 012345', 'Check 1043', '123456789012', 'ZELLE-8H2K-99X1', '4111 1111 1111', '4111a1111b1111c1111']) {
    assert.equal(looksLikePan(fine), false, fine);
  }
});

test('last 4 is exactly four digits', () => {
  assert.equal(isCardLast4('4242'), true);
  for (const bad of ['424', '42424', '42a2', ' 4242', '']) assert.equal(isCardLast4(bad), false, bad);
});

test('a card tender needs brand, four digits and an entry method', () => {
  const ok = parseInPersonTender({ tender: 'card', cardBrand: 'visa', cardLast4: '4242', entryMethod: 'tap', reference: ' 01A2B3 ' });
  assert.deepEqual(ok, { ok: true, tender: { tender: 'card', cardBrand: 'visa', cardLast4: '4242', entryMethod: 'tap', reference: '01A2B3' } });

  assert.equal(parseInPersonTender({ tender: 'card', cardBrand: null, cardLast4: '4242', entryMethod: 'tap' }).ok, false);
  assert.equal(parseInPersonTender({ tender: 'card', cardBrand: 'visa', cardLast4: '42424', entryMethod: 'tap' }).ok, false);
  assert.equal(parseInPersonTender({ tender: 'card', cardBrand: 'visa', cardLast4: '4242', entryMethod: 'on_file' }).ok, false, 'on_file is read-back only');
  assert.equal(parseInPersonTender({ tender: 'card', cardBrand: 'bitcoin', cardLast4: '4242', entryMethod: 'chip' }).ok, false);
});

test('a PAN in any field is refused with the PCI sentence, never echoed', () => {
  const pan = '4111 1111 1111 1111';
  for (const input of [
    { tender: 'card' as const, cardBrand: 'visa', cardLast4: '4242', entryMethod: 'chip', reference: pan },
    { tender: 'card' as const, cardBrand: 'visa', cardLast4: pan, entryMethod: 'chip' },
    { tender: 'other' as const, reference: `check ${pan}` },
    { tender: 'cash' as const, reference: pan },
  ]) {
    const out = parseInPersonTender(input);
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.error, PAN_REFUSAL);
    assert.ok(!out.ok && !out.error.includes('1111'), 'the value is never echoed');
  }
});

test('cash drops card facts; other needs a reference', () => {
  assert.deepEqual(parseInPersonTender({ tender: 'cash', cardBrand: 'visa', cardLast4: '4242', entryMethod: 'tap' }), {
    ok: true,
    tender: { tender: 'cash', cardBrand: null, cardLast4: null, entryMethod: null, reference: null },
  });
  assert.equal(parseInPersonTender({ tender: 'other', reference: '  ' }).ok, false);
  assert.equal(parseInPersonTender({ tender: 'other', reference: 'Zelle 8H2K99' }).ok, true);
  assert.equal(parseInPersonTender({ tender: 'other', reference: 'x'.repeat(81) }).ok, false);
});

test('summary line', () => {
  assert.equal(tenderSummary({ tender: 'card', cardBrand: 'amex', cardLast4: '0005', entryMethod: 'chip' }), 'Amex ···· 0005 · Chip');
  assert.equal(tenderSummary({ tender: 'cash', cardBrand: null, cardLast4: null, entryMethod: null }), 'Cash');
});
