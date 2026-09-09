import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearSavedViewLayout,
  getSavedViewLayout,
  getServerSavedViewLayout,
  setSavedViewLayout,
  subscribeSavedViewLayout,
} from './saved-view-layout-store';
import type { SlotLayout } from './slot-layout-core';

const LAYOUT_A: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }],
  subtitleBindings: [],
  amountFieldId: null,
};

const LAYOUT_B: SlotLayout = { ...LAYOUT_A, statusBindings: [{ fieldId: 'orders.packed' }] };

describe('saved-view layout store', () => {
  it('reads null for a table nobody has published', () => {
    assert.equal(getSavedViewLayout('never-set'), null);
  });

  it('is null on the server — no view is applied at first paint', () => {
    assert.equal(getServerSavedViewLayout(), null);
  });

  it('publishes and reads back per tableId', () => {
    setSavedViewLayout('orders', LAYOUT_A);
    setSavedViewLayout('pickup', LAYOUT_B);
    assert.equal(getSavedViewLayout('orders'), LAYOUT_A);
    assert.equal(getSavedViewLayout('pickup'), LAYOUT_B);
    clearSavedViewLayout('orders');
    clearSavedViewLayout('pickup');
  });

  it('notifies subscribers on a real change', () => {
    let hits = 0;
    const off = subscribeSavedViewLayout(() => {
      hits += 1;
    });
    setSavedViewLayout('orders', LAYOUT_A);
    assert.equal(hits, 1);
    off();
    clearSavedViewLayout('orders');
  });

  it('does NOT notify when the same layout is republished', () => {
    // The menu publishes from an effect that runs on every URL change, so an
    // always-emit would re-render every mounted table on each keystroke in the
    // search field.
    setSavedViewLayout('orders', LAYOUT_A);
    let hits = 0;
    const off = subscribeSavedViewLayout(() => {
      hits += 1;
    });
    setSavedViewLayout('orders', LAYOUT_A);
    assert.equal(hits, 0);
    off();
    clearSavedViewLayout('orders');
  });

  it('clearing an absent table notifies nobody', () => {
    let hits = 0;
    const off = subscribeSavedViewLayout(() => {
      hits += 1;
    });
    clearSavedViewLayout('never-set');
    assert.equal(hits, 0);
    off();
  });

  it('null means "no view applied" and falls the cascade through', () => {
    setSavedViewLayout('orders', LAYOUT_A);
    setSavedViewLayout('orders', null);
    assert.equal(getSavedViewLayout('orders'), null);
    clearSavedViewLayout('orders');
  });
});
