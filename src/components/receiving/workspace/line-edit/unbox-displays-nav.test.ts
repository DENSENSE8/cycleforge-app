/**
 * Unbox Displays navigation predicates — cockpit auto-follow vs operator browse.
 *
 * Pure: no React. {@link LineEditPanel} consults these before yanking the
 * right-edge leaf. Root Index · Inventory · Linkage (and any other leaf the
 * operator opened) are browse, not a vacuum for the step rail to refill.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldCockpitYieldToDisplaysIndex,
  shouldItemPhotosCompareAutoOpen,
} from './unbox-displays-nav';

test('cockpit yields to Displays Root Index until the carton changes', () => {
  assert.equal(shouldCockpitYieldToDisplaysIndex('index', false), true);
  assert.equal(shouldCockpitYieldToDisplaysIndex('index', true), false);
  assert.equal(shouldCockpitYieldToDisplaysIndex('inventory', false), false);
  assert.equal(shouldCockpitYieldToDisplaysIndex('linkage', false), false);
  assert.equal(shouldCockpitYieldToDisplaysIndex(null, false), false);
});

test('item-photos Compare does not yank Index · Inventory · Linkage', () => {
  assert.equal(
    shouldItemPhotosCompareAutoOpen({ requestedDisplay: 'index', activeLeaf: null }),
    false,
  );
  assert.equal(
    shouldItemPhotosCompareAutoOpen({
      requestedDisplay: 'inventory',
      activeLeaf: 'inventory',
    }),
    false,
  );
  assert.equal(
    shouldItemPhotosCompareAutoOpen({
      requestedDisplay: 'linkage',
      activeLeaf: 'linkage',
    }),
    false,
  );
  assert.equal(
    shouldItemPhotosCompareAutoOpen({ requestedDisplay: null, activeLeaf: null }),
    true,
    'closed column may auto-open Compare',
  );
  assert.equal(
    shouldItemPhotosCompareAutoOpen({
      requestedDisplay: 'photos',
      activeLeaf: 'photos',
    }),
    true,
  );
});
