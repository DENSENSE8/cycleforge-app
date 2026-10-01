/**
 * Fulfillment › Fulfilled — `fulfilled.all`, on the Allocate card's anatomy.
 * Goal: find a package that left the building and read what happened to it.
 * One card per PACKAGE (carrier tracking number; a pack scan with none keys as
 * `scan-<id>`). Lines are the box's order lines. Status pills (`?cardStatus=`)
 * sit beside the count. The open package is `?shipment=`.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { OUTBOUND_STATE_META } from '@/lib/outbound-state';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';

export const OUTBOUND_SHIPPED_VIEW: TriageViewDecl = {
  id: 'fulfilled.all',
  grain: 'package',
  noun: { one: 'package', many: 'packages' },
  listLabel: 'Scanned out packages',
  testIdPrefix: 'shipped-card',
  bodyTestId: 'shipped-cards',
  storageKeys: { pageMode: 'cf:shipped-cards:page-mode', scrollTop: 'cf:shipped-cards:scroll-top' },
  recordParams: [SHIPMENT_RECORD_PARAM, 'openOrderId'],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'date',
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'price', tier: 'always' },
  ],
  sections: null,
  next: ['Resolve', ...Object.values(OUTBOUND_STATE_META).map((meta) => meta.label)],
};
