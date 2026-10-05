/**
 * Repair service card-list declaration shared by `/repair` and
 * `/dashboard?mode=repairs`. `?tab=` controls the loaded status set;
 * `?repairStatus=` and exclusions narrow it. `?sort=` is the sidebar
 * queue order.
 *
 * Tailored to the bench (owner 2026-10-04): line 1 = ticket · carton · the
 * device's serial · channel · customer, the SLA top-right; the issue is the
 * headline, the product title under it with the date and receiver. The status
 * is the rail and glyph top-left only — it is changed on the open record or
 * the check-set's strip, never on the card. No photo (no repair carries one),
 * no price, no next step.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';

export const REPAIR_QUEUE_VIEW = triageView({
  id: 'repair.queue',
  grain: 'repair ticket',
  noun: { one: 'repair', many: 'repairs' },
  listLabel: 'Repair service tickets',
  testIdPrefix: 'repair-card',
  bodyTestId: 'repair-cards',
  storageKeys: {
    pageMode: 'cf:repair-cards:page-mode',
    scrollTop: 'cf:repair-cards:scroll-top',
  },
  recordParams: ['openRepair'],
  chips: { owner: 'face', param: REPAIR_STATUS_CHIP_PARAM },
  paging: 'client',
  status: 'deadline',
  slots: { identity: 'ticket number · carton · serial', channel: 'brand', person: 'customer', quickLook: 'peek', photo: 'none' },
  facts: [
    { id: 'product', tier: 'always' },
    { id: 'date', tier: 'label' },
    { id: 'staff', tier: 'detail' },
  ],
  // The host bands dated sorts by the PT day the ticket was opened.
  sections: { order: [], labels: {}, tones: {}, when: 'default-sort' },
  next: [],
});
