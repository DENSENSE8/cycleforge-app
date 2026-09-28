/**
 * The crumb keys (bare 1–6 outside a field, Alt+Shift+1–6 from inside one —
 * never Alt/Ctrl+digit alone: Chrome and the chat own those) and test mode's
 * order number (prefixed once, never twice).
 * Run: npx tsx --test src/lib/orders/intake/checkout-model.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKOUT_STEPS, cartLineFacts, crumbFromKey, lineNeedsPairing, pairLineToHit, teamLineFacts, testOrderNumber } from './checkout-model';
import { newIntakeLine } from './intake-model';

type Mods = Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat', boolean>>;
const key = (k: string, mods: Mods = {}, code = /^[0-9]$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`) => ({
  key: k,
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});

test('bare 1…6 jump to the matching crumb outside a field; past the last step, 0 and letters are not crumbs', () => {
  assert.deepEqual(crumbFromKey(key('1')), { step: 'customer', anywhere: false });
  assert.deepEqual(crumbFromKey(key(String(CHECKOUT_STEPS.length))), { step: 'payment', anywhere: false });
  assert.equal(crumbFromKey(key(String(CHECKOUT_STEPS.length + 1))), null);
  assert.equal(crumbFromKey(key('0')), null);
  assert.equal(crumbFromKey(key('n')), null);
});

test('Alt+Shift+digit jumps from anywhere, read off `code` (⌥⇧3 types a symbol on macOS)', () => {
  assert.deepEqual(crumbFromKey(key('£', { altKey: true, shiftKey: true }, 'Digit3')), { step: 'team', anywhere: true });
  assert.equal(crumbFromKey(key('§', { altKey: true, shiftKey: true }, 'Digit7')), null);
});

test('Alt+digit, Ctrl/⌘+digit, Shift+digit and repeats are never crumb keys', () => {
  for (const mods of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { repeat: true }, { altKey: true, shiftKey: true, ctrlKey: true }] as Mods[]) {
    assert.equal(crumbFromKey(key('2', mods)), null, JSON.stringify(mods));
  }
});

test('test orders save as CF-TEST-<number>, prefixed once whatever the case', () => {
  assert.equal(testOrderNumber('PH-000124'), 'CF-TEST-PH-000124');
  assert.equal(testOrderNumber(' 2291 '), 'CF-TEST-2291');
  assert.equal(testOrderNumber('CF-TEST-PH-000124'), 'CF-TEST-PH-000124');
  assert.equal(testOrderNumber('cf-test-9'), 'cf-test-9');
});

test('a cart line reads SKU · Item # · stock · bin on both faces; the item # is dropped when it repeats the SKU', () => {
  const line = newIntakeLine({ sku: '00162', itemNumber: '231497901', onHand: 3, bin: ' Z1-A-03 ' });
  assert.deepEqual(cartLineFacts(line), ['SKU 00162', 'Item # 231497901', '3 in stock', 'Bin Z1-A-03']);
  assert.deepEqual(cartLineFacts({ ...line, itemNumber: '00162', onHand: 0, bin: null }), ['SKU 00162', '0 in stock']);
});

test('Team leads with the condition grade for a unit, never for a repair service', () => {
  const unit = newIntakeLine({ sku: '00162', condition: 'REFURBISHED' });
  assert.equal(teamLineFacts(unit).length, cartLineFacts(unit).length + 1);
  assert.deepEqual(teamLineFacts(unit).slice(1), cartLineFacts(unit));
  assert.deepEqual(teamLineFacts({ ...unit, sku: '00977-RS' }), cartLineFacts({ ...unit, sku: '00977-RS' }));
  assert.deepEqual(teamLineFacts({ ...unit, condition: null }), cartLineFacts(unit));
});

test('pairing: an unpaired unit line may pair, a repair service or a paired line may not; the listing item # survives', () => {
  const listing = newIntakeLine({ sku: '00162', itemNumber: '231497901' });
  assert.equal(lineNeedsPairing(listing), true);
  assert.equal(lineNeedsPairing({ ...listing, sku: '00977-RS' }), false);
  assert.equal(lineNeedsPairing({ ...listing, skuCatalogId: 560 }), false);
  const hit = { skuCatalogId: 560, sku: 'BOSE-SLC', title: 'Bose Soundlink Color', itemNumber: '999', imageUrl: null, onHand: 2, bin: 'A1' };
  const patch = pairLineToHit(listing, hit as Parameters<typeof pairLineToHit>[1]);
  assert.equal(patch.skuCatalogId, 560);
  assert.equal(patch.itemNumber, '231497901');
  assert.equal(pairLineToHit({ itemNumber: '' }, hit as Parameters<typeof pairLineToHit>[1]).itemNumber, '999');
});
