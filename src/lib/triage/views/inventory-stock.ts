/**
 * Inventory › Stock — `inventory.stock`, the shared three-row triage card.
 * One card per (location, SKU, source) pair: lifecycle and bin identity,
 * product title, SKU · room · qty, then “Count” / “Pair”. Room chips write
 * `?room=`; the State funnel (`?status=`) is the sidebar's.
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
    { id: 'sku', tier: 'always' },
    { id: 'room', tier: 'always' },
    { id: 'qty', tier: 'always' },
  ],
  sections: null,
  next: ['Pair', 'Count'],
};
