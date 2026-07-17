/**
 * Local Pickup terminal resolver unit tests.
 *
 *   node --import tsx --test src/components/work-orders/terminal/pickup-terminal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePickupTerminal } from './pickup-terminal';

const noop = () => {};

test('empty item display resolves to Add item', () => {
  const vm = resolvePickupTerminal('mode-default', {
    itemCount: 0,
    onAddItem: noop,
    onReview: noop,
  });

  assert.equal(vm?.label, 'Add item');
  assert.equal(vm?.tone, 'emerald');
});

test('populated item display resolves to Review with pluralized count', () => {
  const one = resolvePickupTerminal('mode-default', {
    itemCount: 1,
    onAddItem: noop,
    onReview: noop,
  });
  const many = resolvePickupTerminal('mode-default', {
    itemCount: 3,
    onAddItem: noop,
    onReview: noop,
  });

  assert.equal(one?.label, 'Review 1 item');
  assert.equal(many?.label, 'Review 3 items');
});

test('add display always resolves to Add item', () => {
  const vm = resolvePickupTerminal('add-item', {
    itemCount: 3,
    onAddItem: noop,
    onReview: noop,
  });

  assert.equal(vm?.label, 'Add item');
});

test('unknown terminal kinds hide the dock', () => {
  assert.equal(
    resolvePickupTerminal('unknown', {
      itemCount: 1,
      onAddItem: noop,
      onReview: noop,
    }),
    null,
  );
});
