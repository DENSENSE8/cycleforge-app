/**
 * Inbound › Deliveries › Unboxed — `incoming.docked`. Goal: narrow unboxed
 * cartons to one in seconds. One card per carton; line 1 reads its id
 * → platform · vendor → claim ticket → note … activity date; a line reads
 * received/expected → condition → SKU → bin → price ($— struck when none).
 * The rail wears the carton's most urgent attention (Unfound red · Claim · Short,
 * else green Unboxed); bottom-right is the next step the carton strip can run
 * today (Resolve · Claim · Print label), else nothing.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { DOCKED_FLAG_PARAM } from '@/lib/receiving/inbound-lane';
import { DOCKED_NEXT_STEPS } from '@/lib/receiving/docked-record-state';

export const INCOMING_DOCKED_VIEW: TriageViewDecl = {
  id: 'incoming.docked',
  grain: 'carton',
  noun: { one: 'carton', many: 'cartons' },
  listLabel: 'Unboxed cartons',
  testIdPrefix: 'receipt-card',
  bodyTestId: 'receipt-cards',
  storageKeys: { pageMode: 'cf:receipt-cards:scroll', scrollTop: 'cf:receipt-cards:scroll-top' },
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
  next: [...DOCKED_NEXT_STEPS],
};
