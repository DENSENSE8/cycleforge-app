/**
 * Repair service card-list declaration shared by `/repair` and
 * `/dashboard?mode=repairs`. `?tab=` controls the loaded status set;
 * `?repairStatus=` and exclusions narrow it. `?sort=` is the sidebar
 * queue order. Current workflow status is a read-only card fact; changes
 * operate on selected cards.
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
  slots: { identity: 'ticket number · carton', channel: 'brand', person: 'customer', quickLook: 'peek', photo: 'line' },
  facts: [
    { id: 'issue', tier: 'always' },
    { id: 'sku', tier: 'label' },
    { id: 'price', tier: 'always' },
    { id: 'date', tier: 'label' },
    { id: 'staff', tier: 'detail' },
    { id: 'serial', tier: 'detail' },
  ],
  // The host bands dated sorts by the PT day the ticket was opened.
  sections: { order: [], labels: {}, tones: {}, when: 'default-sort' },
  next: [],
});
