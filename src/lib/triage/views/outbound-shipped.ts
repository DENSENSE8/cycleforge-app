/**
 * Shipping › Shipped — `outbound.shipped`, the one-row density
 * (`TriageCardList density="row"`, owner 2026-09-28). Goal: find a shipped
 * package and read what happened to it. One row per PACKAGE (carrier
 * tracking number; a pack scan with none keys as `scan-<id>`): state
 * (`shippedPackageFace`) → tracking → title → shipped · carrier status ·
 * order · packed by → "→ Resolve" on an unmatched scan. No chips: the period, type,
 * carrier and status facets (`ostatus`, …) and Find are the sidebar's, read by
 * the feed. The open package is `?shipment=` (`SHIPMENT_RECORD_PARAM`).
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';

export const OUTBOUND_SHIPPED_VIEW: TriageViewDecl = {
  id: 'outbound.shipped',
  grain: 'package',
  noun: { one: 'package', many: 'packages' },
  listLabel: 'Shipped packages',
  testIdPrefix: 'shipped-row',
  bodyTestId: 'shipped-rows',
  storageKeys: { pageMode: 'cf:shipped-rows:page-mode', scrollTop: 'cf:shipped-rows:scroll-top' },
  recordParams: [SHIPMENT_RECORD_PARAM, 'openOrderId'],
  chips: { owner: 'host', param: 'ostatus' },
  paging: 'client',
  status: 'state',
  facts: [
    { id: 'shipped', tier: 'always' },
    { id: 'carrier', tier: 'always' },
    { id: 'order', tier: 'always' },
    { id: 'packed', tier: 'always' },
  ],
  sections: null,
  next: ['Resolve'],
};
