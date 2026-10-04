/**
 * Products › Import products CSV — the review of a product list before it
 * lands in the catalog: one row per file row, its outcome as the state
 * (New · Title differs · In catalog · Duplicate · No SKU · No title · Old),
 * the SKU as the catalog will key it, the file's title. Not a nav view: it
 * stands in for the catalog list while a file is staged (`?import=csv`).
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';

export const PRODUCTS_CATALOG_IMPORT_VIEW = triageView({
  id: 'products.catalog-import',
  grain: 'product list row',
  noun: { one: 'row', many: 'rows' },
  listLabel: 'Product list to import',
  testIdPrefix: 'catalog-import-row',
  bodyTestId: 'catalog-import-rows',
  storageKeys: {
    pageMode: 'cf:catalog-import-rows:page-mode',
    scrollTop: 'cf:catalog-import-rows:scroll-top',
  },
  recordParams: [],
  chips: { owner: 'face', param: 'catalogImportOutcome' },
  paging: 'client',
  status: 'state',
  slots: { identity: 'SKU', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [
    { id: 'was', tier: 'always' },
    { id: 'catalog', tier: 'always' },
    { id: 'zoho', tier: 'always' },
  ],
  sections: null,
  next: ['Add'],
});
