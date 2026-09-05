import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_NAV_PIN_DROP_ID,
  isPinDropOverId,
  isStructuralSpinePinHref,
  pinIndexFromOverId,
} from './nav-pin';

test('pinIndexFromOverId: drop zone appends, pin: id inserts at that row', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(pinIndexFromOverId(MASTER_NAV_PIN_DROP_ID, ids), 3);
  assert.equal(pinIndexFromOverId('pin:b', ids), 1);
  assert.equal(pinIndexFromOverId('nav:unbox', ids), null);
});

test('isPinDropOverId: only the cluster well and pin rows', () => {
  assert.equal(isPinDropOverId(MASTER_NAV_PIN_DROP_ID), true);
  assert.equal(isPinDropOverId('pin:abc'), true);
  assert.equal(isPinDropOverId('nav:home'), false);
  assert.equal(isPinDropOverId('child:outbound:labels'), false);
});

test('isStructuralSpinePinHref: Home only', () => {
  assert.equal(isStructuralSpinePinHref('/'), true);
  // Query-carrying Home hrefs normalize back to the same registry row — a pin
  // on `/?mode=today` would still be a shortcut to the spine's own root.
  assert.equal(isStructuralSpinePinHref('/?mode=today'), true);
  assert.equal(isStructuralSpinePinHref('/unbox'), false);
  assert.equal(isStructuralSpinePinHref('/products'), false);
});

test('Media Library is pinnable — it is a tool, not the spine root', () => {
  // Was structural until 2026-09-05 purely because it rendered above Pinned.
  // Sitting above Pinned is what a PIN is for; hard-coding one tool there spent
  // spine real estate no operator could reclaim.
  assert.equal(isStructuralSpinePinHref('/ops/photos'), false);
});
