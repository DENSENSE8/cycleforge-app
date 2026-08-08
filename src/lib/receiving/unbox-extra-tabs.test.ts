import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UNBOX_EXTRA_TAB_CATALOG,
  UNBOX_PINNED_EXTRA_TABS_MAX,
  isUnboxExtraTabId,
  isUnboxPinCapReached,
  sanitizeUnboxPinnedExtraTabs,
  unboxExtraTabsAvailable,
} from './unbox-extra-tabs';

test('catalog is Inbound-only for v1', () => {
  assert.equal(UNBOX_EXTRA_TAB_CATALOG.length, 1);
  assert.equal(UNBOX_EXTRA_TAB_CATALOG[0]?.id, 'incoming');
});

test('unboxExtraTabsAvailable hides already-pinned entries', () => {
  assert.equal(unboxExtraTabsAvailable([]).length, 1);
  assert.equal(unboxExtraTabsAvailable(['incoming']).length, 0);
  assert.equal(unboxExtraTabsAvailable(null).length, 1);
});

test('sanitizeUnboxPinnedExtraTabs drops unknown ids and preserves catalog order', () => {
  assert.deepEqual(sanitizeUnboxPinnedExtraTabs(['incoming', 'bogus']), ['incoming']);
  assert.deepEqual(sanitizeUnboxPinnedExtraTabs(['bogus']), []);
  assert.deepEqual(sanitizeUnboxPinnedExtraTabs(undefined), []);
  assert.equal(isUnboxExtraTabId('incoming'), true);
  assert.equal(isUnboxExtraTabId('queue'), false);
});

test('sanitizeUnboxPinnedExtraTabs dedups and never exceeds the pin cap (D2 · D14)', () => {
  assert.equal(UNBOX_PINNED_EXTRA_TABS_MAX, 2);
  // A repeated / hostile list collapses to the catalog set, capped at MAX.
  const many = sanitizeUnboxPinnedExtraTabs(['incoming', 'incoming', 'incoming', 'incoming']);
  assert.deepEqual(many, ['incoming']);
  assert.ok(many.length <= UNBOX_PINNED_EXTRA_TABS_MAX);
  // Output can never exceed the catalog length either.
  assert.ok(many.length <= UNBOX_EXTRA_TAB_CATALOG.length);
});

test('isUnboxPinCapReached only trips at the cap', () => {
  assert.equal(isUnboxPinCapReached(null), false);
  assert.equal(isUnboxPinCapReached([]), false);
  // Today catalog size 1 < cap 2, so a single pin is never at cap.
  assert.equal(isUnboxPinCapReached(['incoming']), false);
});
