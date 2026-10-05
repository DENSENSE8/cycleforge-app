/**
 * Inbound › Deliveries › On the way — `incoming.pipeline` (the Exceptions lane,
 * `?lane=exceptions`, wears it too until it is a nav view of its own). Goal:
 * get it to the dock. One card per purchase; the eye reads order → tracking →
 * expected → the delivery state top-right and the dock verb bottom-right.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { INCOMING_SECTION_LABELS, INCOMING_SECTIONS } from '@/lib/receiving/incoming-sections';
import { INCOMING_EXCEPTION_VERB } from '@/lib/receiving/incoming-exceptions';
import { INBOUND_FOLLOWUP_LABELS } from '@/lib/receiving/inbound-followups';

export const INCOMING_PIPELINE_VIEW = triageView({
  id: 'incoming.pipeline',
  grain: 'purchase',
  noun: { one: 'delivery', many: 'deliveries' },
  listLabel: 'Incoming deliveries',
  testIdPrefix: 'incoming-delivery-card',
  bodyTestId: 'incoming-delivery-cards',
  storageKeys: { pageMode: 'cf:incoming-cards:scroll', scrollTop: 'cf:incoming-cards:scroll-top' },
  recordParams: ['openLine'],
  // Delivery-state buckets are server counts, the sidebar's `incoming.pipeline` facet (`?state=`).
  chips: { owner: 'host', param: 'state' },
  paging: 'server',
  status: 'state',
  slots: { identity: 'marketplace / source order number, else PO number (a pasted number: the number as pasted)', channel: 'none', person: 'vendor', quickLook: 'peek', photo: 'line' },
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'tracking', tier: 'always' },
    { id: 'sku', tier: 'label' },
    { id: 'expected', tier: 'always' },
  ],
  sections: {
    order: INCOMING_SECTIONS,
    labels: INCOMING_SECTION_LABELS,
    tones: { delivered: 'danger', today: 'warning' },
    when: 'default-sort',
  },
  next: [
    'Attach tracking',
    'Monitor',
    'Receive',
    'Unbox',
    'Resolve',
    'Investigate',
    'History',
    ...new Set(Object.values(INCOMING_EXCEPTION_VERB)),
    // A pasted number's follow-up tag is its next step (PastedNumberCard / PastedNumberLine).
    ...Object.values(INBOUND_FOLLOWUP_LABELS),
  ],
});
