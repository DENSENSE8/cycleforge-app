/**
 * Cascade laws: whole-document last-wins (never a deep merge), and soft
 * catalog validation of the winner (stale bindings drop with a warning, the
 * layout still paints, identity falls back to the product default).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog } from './field-catalog/types';
import { resolveEffectiveLayout } from './resolve-effective-layout';
import type { SlotLayout } from './slot-layout';

const CATALOG: FieldCatalog = [
  { id: 'orders.order_id', family: 'orders', label: 'Order', displayType: 'id', slotKinds: ['identity'] },
  { id: 'orders.picked', family: 'orders', label: 'Pick', displayType: 'stage_event', slotKinds: ['status'] },
  { id: 'orders.packed', family: 'orders', label: 'Packed', displayType: 'stage_event', slotKinds: ['status'] },
  { id: 'orders.qty', family: 'orders', label: 'Qty', displayType: 'number', slotKinds: ['subtitle'] },
  { id: 'orders.amount', family: 'orders', label: 'Amount', displayType: 'money', slotKinds: ['subtitle'] },
];

const PRODUCT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }],
  subtitleBindings: [],
  amountFieldId: null,
};

const ORG: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }, { fieldId: 'orders.packed' }],
  subtitleBindings: [{ fieldId: 'orders.qty' }],
  amountFieldId: 'orders.amount',
};

const STAFF: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.packed' }],
  subtitleBindings: [],
  amountFieldId: null,
};

describe('resolveEffectiveLayout precedence', () => {
  it('product default when no layer overrides still pins line qty under the title', () => {
    const resolved = resolveEffectiveLayout({ productDefault: PRODUCT, catalog: CATALOG });
    assert.deepEqual(resolved.statusBindings, PRODUCT.statusBindings);
    assert.deepEqual(resolved.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
    ]);
    assert.equal(resolved.identityFieldId, PRODUCT.identityFieldId);
    assert.equal(resolved.amountFieldId, null);
  });

  it('org layout wins over product for staff with no personal override', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: ORG,
      staffLayout: null,
      catalog: CATALOG,
    });
    assert.deepEqual(resolved.statusBindings, ORG.statusBindings);
    assert.deepEqual(resolved.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
    ]);
    assert.equal(resolved.amountFieldId, null);
  });

  it('staff layout masks org AS A WHOLE DOCUMENT — no binding merge', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: ORG,
      staffLayout: STAFF,
      catalog: CATALOG,
    });
    // Staff bound only packed; the org's tested must NOT bleed through.
    // Qty is engine identity, not an org merge — empty staff subtitles still pin it.
    assert.deepEqual(resolved.statusBindings, [{ fieldId: 'orders.packed' }]);
    assert.deepEqual(resolved.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
    ]);
    assert.equal(resolved.amountFieldId, null);
  });

  it('saved view outranks staff', () => {
    const view: SlotLayout = { ...STAFF, statusBindings: [{ fieldId: 'orders.picked' }] };
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: ORG,
      staffLayout: STAFF,
      savedViewLayout: view,
      catalog: CATALOG,
    });
    assert.deepEqual(resolved.statusBindings, [{ fieldId: 'orders.picked' }]);
  });
});

describe('resolveEffectiveLayout soft validation', () => {
  it('drops a stale status binding, warns, and still paints the rest', () => {
    const warnings: string[] = [];
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: {
        ...ORG,
        statusBindings: [{ fieldId: 'orders.ghost' }, { fieldId: 'orders.packed' }],
      },
      catalog: CATALOG,
      onWarn: (m) => warnings.push(m),
    });
    assert.deepEqual(resolved.statusBindings, [{ fieldId: 'orders.packed' }]);
    assert.match(warnings.join('\n'), /dropped stale status:1 binding 'orders.ghost'/);
  });

  it('drops a binding parked in a band its slotKinds forbids', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: { ...ORG, statusBindings: [{ fieldId: 'orders.qty' }] },
      catalog: CATALOG,
    });
    assert.deepEqual(resolved.statusBindings, []);
    assert.deepEqual(resolved.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
    ]);
  });

  it('falls back to the product identity when the winner names a stale one', () => {
    const warnings: string[] = [];
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: { ...ORG, identityFieldId: 'orders.ghost' },
      catalog: CATALOG,
      onWarn: (m) => warnings.push(m),
    });
    assert.equal(resolved.identityFieldId, 'orders.order_id');
    assert.match(warnings.join('\n'), /identity 'orders.ghost'/);
  });

  it('drops a DUPLICATE binding — a hand-written prefs blob must not paint one fact twice', () => {
    const warnings: string[] = [];
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: {
        ...ORG,
        statusBindings: [{ fieldId: 'orders.picked' }, { fieldId: 'orders.picked' }],
      },
      catalog: CATALOG,
      onWarn: (m) => warnings.push(m),
    });
    assert.deepEqual(resolved.statusBindings, [{ fieldId: 'orders.picked' }]);
    assert.match(warnings.join('\n'), /duplicate status binding 'orders.picked'/);
  });

  it('drops a stale amount binding to null', () => {
    const resolved = resolveEffectiveLayout({
      productDefault: PRODUCT,
      orgLayout: { ...ORG, amountFieldId: 'orders.ghost' },
      catalog: CATALOG,
    });
    assert.equal(resolved.amountFieldId, null);
  });
});
