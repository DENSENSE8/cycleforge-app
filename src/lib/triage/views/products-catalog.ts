/**
 * Products › Catalog — the friendly one-row triage list used by Fulfillment.
 * Find, state, and sort live in the contextual sidebar; rows carry identity,
 * title, the most useful product facts, and the next step without table chrome.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';

export const PRODUCTS_CATALOG_VIEW = triageView({
  id: 'products.catalog',
  grain: 'catalog product',
  noun: { one: 'product', many: 'products' },
  listLabel: 'Product catalog',
  testIdPrefix: 'product-row',
  bodyTestId: 'product-rows',
  storageKeys: {
    pageMode: 'cf:product-rows:page-mode',
    scrollTop: 'cf:product-rows:scroll-top',
  },
  recordParams: [],
  chips: { owner: 'face', param: 'catalogCardStatus' },
  paging: 'client',
  status: 'state',
  slots: { identity: 'SKU', channel: 'none', person: 'none', quickLook: 'none', photo: 'line' },
  facts: [
    { id: 'item', tier: 'always' },
    { id: 'category', tier: 'always' },
    { id: 'channels', tier: 'always' },
    { id: 'inventory', tier: 'always' },
  ],
  sections: null,
  next: ['Open'],
});
