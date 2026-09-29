/**
 * Inbound › Local pickup — one operational card per LCPU order. The Sales
 * pickup surface remains the money ledger; this view is the receiving history
 * and exposes the order's item lines through the shared card disclosure.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

export const PICKUP_HISTORY_VIEW: TriageViewDecl = {
  id: 'pickup.history',
  grain: 'local pickup',
  noun: { one: 'pickup', many: 'pickups' },
  listLabel: 'Local pickup history',
  testIdPrefix: 'pickup-card',
  bodyTestId: 'pickup-cards',
  storageKeys: {
    pageMode: 'cf:pickup-cards:page-mode',
    scrollTop: 'cf:pickup-cards:scroll-top',
  },
  recordParams: ['lcpu'],
  // Status is the contextual sidebar's counted facet; the card face only
  // reads the already-narrowed feed.
  chips: { owner: 'host', param: 'status' },
  paging: 'client',
  status: 'date',
  facts: [
    { id: 'unit', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'qc', tier: 'always' },
    { id: 'label', tier: 'label' },
    { id: 'sku', tier: 'detail' },
    { id: 'price', tier: 'detail' },
  ],
  // The host supplies exact pickup-date labels as band ids.
  sections: { order: [], labels: {}, tones: {}, when: 'default-sort' },
  next: ['Process', 'Triage', 'Print labels', 'Test', 'Retest', 'Resolve failure', 'Put away'],
};
