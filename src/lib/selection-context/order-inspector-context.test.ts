import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  PENDING_BULK_ACTION_KEYS,
  orderBulkActionKeys,
  resolveOrderInspectorContext,
} from './order-inspector-context';

test('Pending / fulfillment opens docs-first with a read-only tray', () => {
  for (const panelContext of ['fulfillment', 'queue'] as const) {
    const ctx = resolveOrderInspectorContext({ panelContext });
    assert.equal(ctx.defaultTab, 'documents');
    assert.equal(ctx.showDocumentsTab, true);
    // Buy / fetch / delete stay on the Labels station.
    assert.equal(ctx.documentsMode, 'preview');
    assert.deepEqual([...ctx.recordCtas], ['assign', 'open_testing']);
  }
});

test('Labels is the only surface that manages documents', () => {
  const labels = resolveOrderInspectorContext({ panelContext: 'labels' });
  assert.equal(labels.documentsMode, 'manage');
  assert.equal(labels.defaultTab, 'shipping');

  for (const panelContext of ['dashboard', 'staged', 'fulfillment', 'queue'] as const) {
    assert.notEqual(resolveOrderInspectorContext({ panelContext }).documentsMode, 'manage');
  }
});

test('station-family panels keep the shipping-first body and no Documents tab', () => {
  for (const panelContext of ['station', 'packer', 'shipped'] as const) {
    const ctx = resolveOrderInspectorContext({ panelContext });
    assert.equal(ctx.defaultTab, 'shipping');
    assert.equal(ctx.showDocumentsTab, false);
    assert.equal(ctx.documentsMode, 'hidden');
  }
});

test('journeyFirst (search deep-link) wins over the context default', () => {
  assert.equal(
    resolveOrderInspectorContext({ panelContext: 'fulfillment', journeyFirst: true }).defaultTab,
    'timeline',
  );
  assert.equal(
    resolveOrderInspectorContext({ panelContext: 'dashboard', journeyFirst: true }).defaultTab,
    'timeline',
  );
});

test('pre-pack lanes prep the unit; post-pack lanes reprint the shipping document', () => {
  const pending = orderBulkActionKeys('unshipped');
  assert.deepEqual([...pending], ['copy', 'assign', 'ship-by', 'print', 'flag', 'export', 'delete']);
  assert.deepEqual([...PENDING_BULK_ACTION_KEYS], [...pending]);

  const packed = orderBulkActionKeys('packed');
  assert.ok(packed.includes('print-shipping'));
  // Assigning a tester to an order that is already packed is not a thing.
  assert.ok(!packed.includes('assign'));
  assert.ok(!packed.includes('ship-by'));
  assert.ok(!packed.includes('print'));

  // `flag` annotates the record, so it holds on every lane — a shipped order
  // can still be Damaged.
  assert.ok(packed.includes('flag'));
  assert.deepEqual([...orderBulkActionKeys('shipped')], [...packed]);
  assert.deepEqual([...orderBulkActionKeys('tested')], [...pending]);
});

test('export and copy hold on every lane — they only read the selected rows', () => {
  for (const view of ['unshipped', 'tested', 'packed', 'shipped'] as const) {
    const keys = orderBulkActionKeys(view);
    assert.ok(keys.includes('export'), `${view} should offer export`);
    assert.ok(keys.includes('copy'), `${view} should offer copy`);
    assert.ok(keys.includes('delete'), `${view} should offer delete`);
  }
});
