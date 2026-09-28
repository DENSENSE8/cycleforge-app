/**
 * Outbound › Shipping › To ship — `outbound.triage`. Goal: pick and ship fast.
 * The eye reads order → stock → bin → Pick: facts lead with what blocks a
 * pick (condition, stock) and where it lives (bin); the top-right is the
 * ship-by deadline; sections are the SLA under the default sort.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { ORDER_NOUN, ORDER_SLA_SECTIONS } from '@/lib/orders/order-card-model';

export const OUTBOUND_TRIAGE_VIEW: TriageViewDecl = {
  id: 'outbound.triage',
  grain: 'order',
  noun: ORDER_NOUN,
  listLabel: 'Orders to ship',
  testIdPrefix: 'order-card',
  bodyTestId: 'pending-grid-body',
  // Kept from the first card list so remembered prefs survive.
  storageKeys: { pageMode: 'cf:order-cards:scroll', scrollTop: 'cf:order-cards:scroll-top' },
  recordParams: ['openOrderId', 'open'],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'deadline',
  // SKU and price give way in the unfolded columns below the `label` tier (the quick look keeps them).
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'stock', tier: 'always' },
    { id: 'sku', tier: 'label' },
    { id: 'bin', tier: 'always' },
    { id: 'price', tier: 'label' },
  ],
  sections: {
    order: ORDER_SLA_SECTIONS,
    labels: { late: 'Late', today: 'Due today', soon: 'Tomorrow', later: 'Later', none: 'No ship-by' },
    tones: { late: 'danger', today: 'warning' },
    when: 'default-sort',
  },
  next: ['Pick', 'Pack', 'Scan out', 'Hand over'],
};
