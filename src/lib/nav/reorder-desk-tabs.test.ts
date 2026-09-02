/**
 * Unit tests for desk-tab reorder (existing child ids only).
 *   node --import tsx --test src/lib/nav/reorder-desk-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownChildOrder, upsertChildOrder } from './org-nav';
import { reorderDeskTabs } from './reorder-desk-tabs';

test('isKnownChildOrder rejects empty, singles, dupes, and ghosts', () => {
  const known = ['orders', 'shortage', 'fba'];
  assert.equal(isKnownChildOrder(known, []), false);
  assert.equal(isKnownChildOrder(known, ['orders']), false);
  assert.equal(isKnownChildOrder(known, ['orders', 'orders']), false);
  assert.equal(isKnownChildOrder(known, ['orders', 'ghost']), false);
  assert.equal(isKnownChildOrder(known, ['shortage', 'orders']), true);
});

test('upsertChildOrder keeps leftover child overrides (hidden) off the drop list', () => {
  const current = {
    entries: [
      {
        id: 'outbound',
        children: [
          { id: 'exceptions', hidden: true },
          { id: 'orders', order: 0 },
        ],
      },
    ],
  };
  const next = upsertChildOrder(current, 'outbound', ['fba', 'orders']);
  const children = next.entries[0]?.children ?? [];
  assert.deepEqual(
    children.filter((c) => c.id !== 'exceptions').map((c) => c.id),
    ['fba', 'orders'],
  );
  assert.equal(children.find((c) => c.id === 'exceptions')?.hidden, true);
});

test('reorderDeskTabs writes order onto an existing desk page', () => {
  const result = reorderDeskTabs({
    pageId: 'outbound',
    orderedIds: ['shortage', 'orders', 'fba'],
    current: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const kids = result.definition.entries[0]?.children ?? [];
  assert.deepEqual(
    kids.filter((c) => c.order !== undefined).map((c) => c.id),
    ['shortage', 'orders', 'fba'],
  );
});

test('reorderDeskTabs refuses a non-tabbed page and unknown ids', () => {
  assert.deepEqual(
    reorderDeskTabs({ pageId: 'not-a-page', orderedIds: ['a', 'b'], current: null }),
    { ok: false, error: 'UNKNOWN_PAGE' },
  );
  const incoming = reorderDeskTabs({
    pageId: 'incoming',
    orderedIds: ['a', 'b'],
    current: null,
  });
  assert.equal(incoming.ok, false);
  const ghost = reorderDeskTabs({
    pageId: 'outbound',
    orderedIds: ['orders', 'not-a-tab'],
    current: null,
  });
  assert.deepEqual(ghost, { ok: false, error: 'UNKNOWN_IDS' });
});
