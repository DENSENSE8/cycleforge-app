/**
 * Outbound › Shipping › To ship — `outbound.triage`. Goal: pick and ship fast.
 * A line reads ×qty · condition · price (owner 2026-09-28: no stock, item #
 * or bin on the list — easy viewing; the open record carries them). The
 * top-right is the ship-by deadline; sections are the SLA under the default sort.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { ORDER_NOUN, ORDER_SLA_SECTIONS } from '@/lib/orders/order-card-model';

export const OUTBOUND_TRIAGE_VIEW = triageView({
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
  slots: { identity: 'order number', channel: 'brand', person: 'buyer', quickLook: 'peek', photo: 'line' },
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'price', tier: 'always' },
  ],
  sections: {
    order: ORDER_SLA_SECTIONS,
    labels: { late: 'Late', today: 'Due today', soon: 'Tomorrow', later: 'Later', none: 'No ship-by' },
    tones: { late: 'danger', today: 'warning' },
    when: 'default-sort',
  },
  next: ['Pick', 'Pack', 'Scan out', 'Hand over'],
});
