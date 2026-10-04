/**
 * Inventory › Stock — `inventory.stock`, one expandable card per rack level:
 * line 1 = room · rack (top-left) … the rack's total on hand, then when it was
 * last counted / moved (top-right date); the lead product, then +N product
 * positions using Allocate's disclosure; Space folds every position with its
 * last count and move. Stock-health chips write `?status=` in the middle bar;
 * Room and Aisle live in the contextual sidebar.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';

export const INVENTORY_STOCK_VIEW = triageView({
  id: 'inventory.stock',
  grain: 'stock rack',
  noun: { one: 'stock rack', many: 'stock racks' },
  listLabel: 'Stock by location',
  testIdPrefix: 'stock-row',
  bodyTestId: 'stock-rows',
  storageKeys: { pageMode: 'cf:stock-rows:page-mode', scrollTop: 'cf:stock-rows:scroll-top' },
  recordParams: ['open', 'sku'],
  chips: { owner: 'face', param: 'status' },
  paging: 'client',
  status: 'date',
  slots: { identity: 'room · rack', channel: 'none', person: 'none', quickLook: 'peek', photo: 'line' },
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'position', tier: 'always' },
    { id: 'sku', tier: 'always' },
  ],
  sections: null,
  next: [],
});
