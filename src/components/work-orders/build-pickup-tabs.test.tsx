/**
 * Local Pickup SectionTabs registry guard.
 *
 *   node --import tsx --test src/components/work-orders/build-pickup-tabs.test.tsx
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPickupTabs } from './build-pickup-tabs';

test('buildPickupTabs keeps item/add ids aligned with the terminal registry', () => {
  const tabs = buildPickupTabs({
    itemContent: null,
    addContent: null,
    itemCount: 2,
  });

  assert.deepEqual(
    tabs.map(({ id, label }) => ({ id, label })),
    [
      { id: 'item', label: 'Item · 2' },
      { id: 'add', label: 'Add item' },
    ],
  );
});
