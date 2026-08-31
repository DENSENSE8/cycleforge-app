/**
 * Org-layout bag laws: tolerant reads (a bad org override degrades, never
 * crashes), and read-modify-write of the WHOLE map (the JSONB `||` merge is
 * shallow, so a one-table write must carry siblings verbatim).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORDERS_PRODUCT_LAYOUT } from './field-catalog/orders';
import {
  nextTableLayoutsMap,
  readOrgTableLayout,
  slotCatalogFor,
  slotMorphsFor,
} from './org-table-layouts';

describe('slotCatalogFor', () => {
  it('serves the opted-in families and refuses the rest', () => {
    assert.ok(slotCatalogFor('orders'));
    // Wave 2 (kill-list 07 §4): pickup is opted in.
    assert.ok(slotCatalogFor('pickup'));
    // Fork kill 2026-08-30: the Amazon-Prep board is opted in.
    assert.ok(slotCatalogFor('fba'));
    assert.equal(slotCatalogFor('repair'), null);
    assert.equal(slotCatalogFor(''), null);
  });
});

describe('slotMorphsFor', () => {
  it('each mount only accepts the morphs it can PAINT — others refuse at the write gate', () => {
    assert.deepEqual(slotMorphsFor('orders'), ['compound']);
    // Pickup is the sheet-morph proof; a compound layout would promise a
    // two-row item cell nothing draws.
    assert.deepEqual(slotMorphsFor('pickup'), ['sheet']);
    assert.deepEqual(slotMorphsFor('fba'), ['sheet']);
    assert.deepEqual(slotMorphsFor('repair'), []);
  });
});

describe('readOrgTableLayout', () => {
  it('reads a stored layout and rejects malformed bags to null', () => {
    const settings = { tableLayouts: { orders: ORDERS_PRODUCT_LAYOUT } };
    assert.deepEqual(readOrgTableLayout(settings, 'orders'), ORDERS_PRODUCT_LAYOUT);
    assert.equal(readOrgTableLayout(settings, 'pickup'), null);
    assert.equal(readOrgTableLayout({}, 'orders'), null);
    assert.equal(readOrgTableLayout(null, 'orders'), null);
    assert.equal(readOrgTableLayout({ tableLayouts: 'legacy' }, 'orders'), null);
    assert.equal(readOrgTableLayout({ tableLayouts: { orders: { rows: [] } } }, 'orders'), null);
  });
});

describe('nextTableLayoutsMap', () => {
  it('replaces one key and carries siblings VERBATIM (even unreadable ones)', () => {
    const settings = {
      tableLayouts: { pickup: { legacy: true }, orders: ORDERS_PRODUCT_LAYOUT },
    };
    const next = nextTableLayoutsMap(settings, 'orders', {
      ...ORDERS_PRODUCT_LAYOUT,
      statusBindings: [],
    });
    assert.deepEqual(next.pickup, { legacy: true });
    assert.deepEqual(
      (next.orders as { statusBindings: unknown[] }).statusBindings,
      [],
    );
  });

  it('null deletes the key — reset to product default', () => {
    const settings = { tableLayouts: { orders: ORDERS_PRODUCT_LAYOUT, pickup: { x: 1 } } };
    const next = nextTableLayoutsMap(settings, 'orders', null);
    assert.deepEqual(Object.keys(next), ['pickup']);
  });

  it('starts a fresh map from a missing or malformed bag', () => {
    assert.deepEqual(nextTableLayoutsMap(null, 'orders', ORDERS_PRODUCT_LAYOUT), {
      orders: ORDERS_PRODUCT_LAYOUT,
    });
    assert.deepEqual(
      Object.keys(nextTableLayoutsMap({ tableLayouts: 'legacy' }, 'orders', ORDERS_PRODUCT_LAYOUT)),
      ['orders'],
    );
  });
});
