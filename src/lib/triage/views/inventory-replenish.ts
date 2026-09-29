/**
 * Inventory › Replenish — `inventory.replenish` (Need to order), the one-row
 * density (`TriageCardList density="row"`, owner 2026-09-28). Goal: turn each
 * purchasing request into a PO. One row per replenishment request: state
 * (`REPLENISHMENT_RECORD_STATE`) → SKU → item → vendor · order qty · stock ·
 * orders waiting → "→ Review" … "→ Receive". No chips: Find (`?rsku=`) and
 * the Status choice (`?rstatus=`) are the sidebar's, narrowed on the server.
 * The open request is host state (no URL param).
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

export const INVENTORY_REPLENISH_VIEW: TriageViewDecl = {
  id: 'inventory.replenish',
  grain: 'purchasing request',
  noun: { one: 'request', many: 'requests' },
  listLabel: 'Purchasing plan',
  testIdPrefix: 'replenish-row',
  bodyTestId: 'replenish-rows',
  storageKeys: { pageMode: 'cf:replenish-rows:page-mode', scrollTop: 'cf:replenish-rows:scroll-top' },
  recordParams: [],
  chips: { owner: 'host', param: 'rstatus' },
  paging: 'client',
  status: 'state',
  facts: [
    { id: 'vendor', tier: 'always' },
    { id: 'qty', tier: 'always' },
    { id: 'stock', tier: 'always' },
    { id: 'waiting', tier: 'always' },
  ],
  sections: null,
  next: ['Review', 'Plan PO', 'Create PO', 'Await receipt', 'Receive', 'Complete', 'Closed'],
};
