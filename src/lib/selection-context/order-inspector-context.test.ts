import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  PENDING_BULK_ACTION_KEYS,
  orderBulkActionKeys,
  resolveOrderInspectorContext,
} from './order-inspector-context';

test('Pending / fulfillment opens shipping-first with a read-only documents tray', () => {
  for (const panelContext of ['fulfillment', 'queue'] as const) {
    const ctx = resolveOrderInspectorContext({ panelContext });
    assert.equal(ctx.defaultTab, 'shipping');
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
    assert.equal(ctx.openOnIndex, false);
  }
});

test('Packed opens the Root Index and hides Documents', () => {
  for (const ctx of [
    resolveOrderInspectorContext({ panelContext: 'packed' }),
    resolveOrderInspectorContext({ panelContext: 'dashboard', orderView: 'packed' }),
    resolveOrderInspectorContext({ panelContext: 'fulfillment', orderView: 'packed' }),
  ]) {
    assert.equal(ctx.showDocumentsTab, false);
    assert.equal(ctx.documentsMode, 'hidden');
    assert.equal(ctx.openOnIndex, true);
    assert.equal(ctx.showDispatchExtras, true);
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
  const packedJourney = resolveOrderInspectorContext({
    panelContext: 'packed',
    journeyFirst: true,
  });
  assert.equal(packedJourney.defaultTab, 'timeline');
  assert.equal(packedJourney.openOnIndex, false);
  assert.equal(packedJourney.showDocumentsTab, false);
});

test('pre-pack lanes prep the unit; post-pack lanes reprint the shipping document', () => {
  const pending = orderBulkActionKeys('unshipped');
  assert.deepEqual(
    [...pending],
    ['download-photos', 'copy', 'assign-pick', 'assign-pack', 'condition', 'qty', 'notes', 'listing-rule', 'ship-by', 'print', 'flag', 'export', 'delete'],
  );
  assert.deepEqual([...PENDING_BULK_ACTION_KEYS], [...pending]);

  const packed = orderBulkActionKeys('packed');
  assert.ok(packed.includes('print-shipping'));
  // Assigning a tester to an order that is already packed is not a thing.
  assert.ok(!packed.includes('assign'));
  assert.ok(!packed.includes('assign-pick'));
  assert.ok(!packed.includes('assign-pack'));
  assert.ok(!packed.includes('listing-rule'));
  assert.ok(!packed.includes('ship-by'));
  assert.ok(!packed.includes('print'));
  assert.ok(!packed.includes('condition'));
  assert.ok(!packed.includes('qty'));
  assert.ok(packed.includes('notes'));

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
    assert.ok(keys.includes('download-photos'), `${view} should offer photo download`);
    assert.ok(keys.includes('delete'), `${view} should offer delete`);
  }
});

test('dispatch / delete / dock are resolved here, not re-derived in the body', () => {
  // These three used to live in `ShippedDetailsBody` as a prop plus two local
  // expressions, each spelling the same lane set differently
  // (`context === 'dashboard' || isFulfillmentPanel || isLabelsPanel`). One
  // descriptor now answers all three, so a new context cannot answer two of
  // them and forget the third.
  const dispatchLanes = ['dashboard', 'queue', 'fulfillment', 'labels'] as const;
  const observeLanes = ['staged', 'station', 'packer', 'shipped'] as const;

  for (const panelContext of dispatchLanes) {
    const ctx = resolveOrderInspectorContext({ panelContext });
    assert.equal(ctx.showDispatchExtras, true, `${panelContext} dispatches`);
    assert.equal(ctx.showDelete, true, `${panelContext} may delete`);
  }

  for (const panelContext of observeLanes) {
    const ctx = resolveOrderInspectorContext({ panelContext });
    assert.equal(
      ctx.showDispatchExtras,
      false,
      `${panelContext} observes an order someone else dispatches`,
    );
    assert.equal(ctx.showDelete, false, `${panelContext} must not delete`);
  }
});

test('every context mounts the editor dock — the old 5-way disjunction was a tautology', () => {
  // `showEditorDock` read `showDashboardExtras || staged || station || packer ||
  // shipped`, which unions to every context there is. Kept as a descriptor field
  // so a future context has somewhere to say no; pinned so nobody "simplifies"
  // it back into a hand-written disjunction that drifts.
  for (const panelContext of [
    'dashboard',
    'queue',
    'fulfillment',
    'labels',
    'staged',
    'station',
    'packer',
    'shipped',
    'packed',
  ] as const) {
    assert.equal(
      resolveOrderInspectorContext({ panelContext }).showEditorDock,
      true,
      `${panelContext} mounts the editor dock`,
    );
  }
});
