/**
 * Shipping › Shipped — `outbound.shipped`, on the Allocate card's anatomy
 * (owner 2026-09-29: the Shipped page wears the To-ship / Allocate display).
 * Goal: find a shipped package and read what happened to it. One card per
 * PACKAGE (carrier tracking number; a pack scan with none keys as
 * `scan-<id>`): state rail + glyph (`shippedPackageFace`) · order number ·
 * channel · packer · carrier status + tracking · shipped stamp top-right; its
 * lines are the box's order lines (×qty · condition · price, the Allocate
 * card's facts) folded behind "+N items"; the package's status sits at the
 * card's bottom-right where Allocate paints its next step ("→ Resolve" on an
 * unmatched scan). Status pills (`?cardStatus=`) sit beside the count, the
 * Allocate summary row's place; the period, type, carrier and tracking-status
 * facets and Find are the sidebar's, read by the feed. The open package is
 * `?shipment=` (`SHIPMENT_RECORD_PARAM`).
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { OUTBOUND_STATE_META } from '@/lib/outbound-state';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';

export const OUTBOUND_SHIPPED_VIEW: TriageViewDecl = {
  id: 'outbound.shipped',
  grain: 'package',
  noun: { one: 'package', many: 'packages' },
  listLabel: 'Shipped packages',
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
