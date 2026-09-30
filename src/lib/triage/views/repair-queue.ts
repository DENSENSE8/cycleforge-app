/**
 * Repair service — one card per repair ticket (`RepairCardList`), on the
 * Receiving › Repair service desk (`/repair`) and Sales › Repair service
 * (`/dashboard?mode=repairs`). Status (`?tab=`, what is loaded), channel
 * (`?channel=`) and Sort (`?sort=`) are the contextual sidebar's; the status
 * chips beside the count (`?repairStatus=`) narrow the loaded tickets. The SLA
 * (3 business days, `repair_service.due_at`) is the top-right status; the
 * serial sits bottom-right, so there is no next-step vocabulary.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';

export const REPAIR_QUEUE_VIEW: TriageViewDecl = {
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
  facts: [
    { id: 'issue', tier: 'always' },
    { id: 'price', tier: 'always' },
    { id: 'date', tier: 'label' },
    { id: 'staff', tier: 'detail' },
  ],
  // The host bands dated sorts by the PT day the ticket was opened.
  sections: { order: [], labels: {}, tones: {}, when: 'default-sort' },
  next: [],
};
