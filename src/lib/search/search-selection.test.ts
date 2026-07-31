/**
 * Tests for `/search` durable selection (`?sel=`).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatSearchSel,
  isSearchSelActive,
  parseSearchSel,
  soleHitSel,
} from './search-selection';

test('formatSearchSel / parseSearchSel round-trip', () => {
  assert.equal(formatSearchSel('receiving', 50200), 'receiving:50200');
  assert.deepEqual(parseSearchSel('receiving:50200'), {
    entityType: 'receiving',
    id: 50200,
  });
  assert.deepEqual(parseSearchSel('order:12'), { entityType: 'order', id: 12 });
});

test('parseSearchSel refuses garbage', () => {
  assert.equal(parseSearchSel(null), null);
  assert.equal(parseSearchSel(''), null);
  assert.equal(parseSearchSel('order'), null);
  assert.equal(parseSearchSel('not_a_thing:1'), null);
  assert.equal(parseSearchSel('order:0'), null);
  assert.equal(parseSearchSel('order:-3'), null);
  assert.equal(parseSearchSel('order:NaN'), null);
});

test('isSearchSelActive matches entity + id', () => {
  const sel = parseSearchSel('receiving:50200');
  assert.equal(isSearchSelActive(sel, { entityType: 'receiving', id: 50200 }), true);
  assert.equal(isSearchSelActive(sel, { entityType: 'order', id: 50200 }), false);
  assert.equal(isSearchSelActive(sel, { entityType: 'receiving', id: 1 }), false);
  assert.equal(isSearchSelActive(null, { entityType: 'receiving', id: 50200 }), false);
});

test('soleHitSel: one hit of ANY type selects; a real list never does', () => {
  assert.equal(soleHitSel([{ id: 50200, entityType: 'receiving' }]), 'receiving:50200');
  assert.equal(soleHitSel([{ id: 12, entityType: 'unit' }]), 'unit:12');
  assert.equal(soleHitSel([{ id: 9, entityType: 'repair' }]), 'repair:9');
  assert.equal(soleHitSel([]), null);
  assert.equal(
    soleHitSel([
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'receiving' },
    ]),
    null,
  );
});

test('soleHitSel: refuses an unusable id or an unknown vocabulary', () => {
  assert.equal(soleHitSel([{ id: 0, entityType: 'receiving' }]), null);
  assert.equal(soleHitSel([{ id: -3, entityType: 'receiving' }]), null);
  assert.equal(soleHitSel([{ id: Number.NaN, entityType: 'receiving' }]), null);
  assert.equal(soleHitSel([{ id: 5, entityType: 'not_a_thing' }]), null);
});
