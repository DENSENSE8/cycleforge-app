/**
 * Deliveries › Docked — `incoming.docked`. A package-first, multi-height carton
 * table, newest arrival scan first. Its stacked rows match Unboxed's readable
 * grammar; membership and copy remain Docked-specific and end when Unbox opens.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { DOCKED_FLAG_PARAM } from '@/lib/receiving/inbound-lane';
import { DOCKED_PACKAGE_NEXT_STEPS } from '@/lib/receiving/docked-record-state';

export const INCOMING_DOCKED_VIEW: TriageViewDecl = {
  id: 'incoming.docked',
  grain: 'carton',
  noun: { one: 'carton', many: 'cartons' },
  listLabel: 'Docked packages',
  testIdPrefix: 'docked-package',
  bodyTestId: 'docked-packages',
  storageKeys: { pageMode: 'cf:docked-packages:scroll', scrollTop: 'cf:docked-packages:scroll-top' },
  recordParams: ['openLine'],
  // The attention cut: Claim · Short · Unfound pills (comma list) — the face owns it; no sidebar twin.
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
    labels: { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier', undated: 'No activity date' },
    tones: { today: 'warning' },
    when: 'default-sort',
  },
  next: [...DOCKED_PACKAGE_NEXT_STEPS],
};
