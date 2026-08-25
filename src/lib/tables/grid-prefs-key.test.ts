/**
 * Run:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/tables/grid-prefs-key.test.ts
 *
 * Behaviour, not shape. The one thing that can actually break when a prefs key
 * stops being a closed union is a REGISTRY lookup being handed an instance key:
 * `TABLE_COLUMNS[key]` misses, the Fields menu comes back empty, and the grid
 * renders with no column vocabulary. `gridPrefsBaseId` is the guard, so it is
 * the thing worth pinning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { gridPrefsBaseId, tableColumnsFor } from './table-columns';

test('a family key is its own base', () => {
  assert.equal(gridPrefsBaseId('orders'), 'orders');
  assert.equal(gridPrefsBaseId('incoming'), 'incoming');
  // A family id that itself contains a hyphen must not be mistaken for a suffix.
  assert.equal(gridPrefsBaseId('my-day'), 'my-day');
  assert.equal(gridPrefsBaseId('tech-all'), 'tech-all');
  assert.equal(gridPrefsBaseId('catalog-link'), 'catalog-link');
  // Underscores likewise (`incoming_embed` is its own bucket by design).
  assert.equal(gridPrefsBaseId('incoming_embed'), 'incoming_embed');
});

test('an instance key resolves to the family that owns its columns', () => {
  assert.equal(gridPrefsBaseId('orders:tab-7'), 'orders');
  assert.equal(gridPrefsBaseId('incoming:tab-abc123'), 'incoming');
  assert.equal(gridPrefsBaseId('my-day:tab-1'), 'my-day');
});

test('only the FIRST colon splits, so a tab id may contain one', () => {
  // Tab ids are minted elsewhere and are not this module's to constrain.
  assert.equal(gridPrefsBaseId('orders:session:9f2c'), 'orders');
});

test('an instance key still finds the family column vocabulary', () => {
  const family = tableColumnsFor('orders');
  assert.ok(family.length > 0, 'orders must have columns for this test to mean anything');
  assert.deepEqual(tableColumnsFor(gridPrefsBaseId('orders:tab-7')), family);
});
