/** Deliveries › Unboxed — cartons opened or completed at the Unbox station. */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { DOCKED_FLAG_PARAM } from '@/lib/receiving/inbound-lane';
import { DOCKED_NEXT_STEPS } from '@/lib/receiving/docked-record-state';

export const INCOMING_UNBOXED_VIEW = triageView({
  id: 'incoming.unboxed',
  grain: 'carton',
  noun: { one: 'carton', many: 'cartons' },
  listLabel: 'Unboxed cartons',
  testIdPrefix: 'unboxed-card',
  bodyTestId: 'unboxed-cards',
  storageKeys: { pageMode: 'cf:unboxed-cards:scroll', scrollTop: 'cf:unboxed-cards:scroll-top' },
  recordParams: ['openLine'],
  // The attention cut (Unfound · Claim · Short, any-of): the face cuts by it; the sidebar's Status facet writes it (`nav/facets/unbox.ts`).
  chips: { owner: 'face', param: DOCKED_FLAG_PARAM },
  paging: 'client',
  // The far right is "Unboxed by <staff>" (owner 2026-09-30), a trailing fact — no status painter.
  status: 'none',
  slots: { identity: 'order / PO number, else carton number', channel: 'brand', person: 'vendor', quickLook: 'peek', photo: 'line' },
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
});
