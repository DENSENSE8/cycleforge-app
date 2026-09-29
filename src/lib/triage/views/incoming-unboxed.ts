/** Deliveries › Unboxed — cartons opened or completed at the Unbox station. */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { DOCKED_FLAG_PARAM } from '@/lib/receiving/inbound-lane';
import { DOCKED_NEXT_STEPS } from '@/lib/receiving/docked-record-state';

export const INCOMING_UNBOXED_VIEW: TriageViewDecl = {
  id: 'incoming.unboxed',
  grain: 'carton',
  noun: { one: 'carton', many: 'cartons' },
  listLabel: 'Unboxed cartons',
  testIdPrefix: 'unboxed-card',
  bodyTestId: 'unboxed-cards',
  storageKeys: { pageMode: 'cf:unboxed-cards:scroll', scrollTop: 'cf:unboxed-cards:scroll-top' },
  recordParams: ['openLine'],
  chips: { owner: 'face', param: DOCKED_FLAG_PARAM },
  paging: 'client',
  status: 'date',
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'sku', tier: 'label' },
    { id: 'bin', tier: 'always' },
    { id: 'price', tier: 'always' },
  ],
  sections: {
    order: ['today', 'yesterday', 'week', 'earlier', 'undated'],
    labels: { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier', undated: 'No unbox date' },
    tones: { today: 'warning' },
    when: 'default-sort',
  },
  next: [...DOCKED_NEXT_STEPS],
};
