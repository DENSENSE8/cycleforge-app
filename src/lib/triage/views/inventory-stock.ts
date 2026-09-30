/**
 * Inventory › Stock — `inventory.stock`, the shared triage card, three rows:
 * line 1 = room · bin (top-left) … last counted / moved (top-right); the
 * product title; then the count left of the SKU. No next step. Room chips write
 * `?room=` and sit inline in the bar (`summaryInline`); the State funnel
 * (`?status=`) is the sidebar's.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

export const INVENTORY_STOCK_VIEW: TriageViewDecl = {
  id: 'inventory.stock',
  grain: 'stock pair',
  noun: { one: 'stock pair', many: 'stock pairs' },
  listLabel: 'Stock by location',
  testIdPrefix: 'stock-row',
  bodyTestId: 'stock-rows',
  storageKeys: { pageMode: 'cf:stock-rows:page-mode', scrollTop: 'cf:stock-rows:scroll-top' },
  recordParams: ['open', 'sku'],
  chips: { owner: 'face', param: 'room' },
  paging: 'client',
  status: 'state',
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'sku', tier: 'always' },
  ],
  sections: null,
  next: [],
};
