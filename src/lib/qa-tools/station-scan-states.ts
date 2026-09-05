/**
 * QA station-state fixtures — canned scan contexts so a tester can open
 * Incoming / Exception / Not matching on a floor station without importing
 * live orders. Tracking numbers live in `qa-org.ts` (Playwright SoT).
 */

import type { ActiveStationOrder } from '@/hooks/station/types';
import {
  QA_FIXTURE_ORDERS,
  QA_FIXTURE_ORDER_TITLES,
  QA_FIXTURE_SKUS,
  QA_FIXTURE_TRACKING_PENDING,
  QA_FIXTURE_TRACKING_UNMATCHED,
} from '@/lib/tenancy/qa-org';
import { SCAN_STATION_OVERLAY_COHORT } from '@/lib/station/scan-station-overlay-cohort';

export const QA_STATION_SCAN_EVENT = 'qa-station-scan-state';

export const QA_STATION_SCAN_KINDS = ['incoming', 'exception', 'unmatched', 'clear'] as const;
export type QaStationScanKind = (typeof QA_STATION_SCAN_KINDS)[number];

export type QaStationScanEventDetail = { kind: QaStationScanKind };

export const QA_STATION_SCAN_TRACKING = {
  incoming: QA_FIXTURE_TRACKING_PENDING,
  unmatched: QA_FIXTURE_TRACKING_UNMATCHED,
  exception: '9400100000000000000888',
} as const;

export const QA_STATION_EXCEPTION_ORDER: ActiveStationOrder = {
  id: null,
  orderId: 'QA-TEST-EXCEPTION',
  productTitle: 'QA — Exception (not on a live order)',
  itemNumber: null,
  sku: QA_FIXTURE_SKUS.speaker,
  condition: 'Used',
  notes: '',
  tracking: QA_STATION_SCAN_TRACKING.exception,
  serialNumbers: [],
  testDateTime: null,
  testedBy: null,
  quantity: 1,
  orderFound: false,
  sourceType: 'exception',
  scanSessionId: 'qa-exception-session',
  inlineMicrocopy: 'Order not in system — tracking logged for reconciliation.',
};

export const QA_STATION_STATE_BUTTONS: ReadonlyArray<{
  kind: Exclude<QaStationScanKind, 'clear'>;
  label: string;
  hint: string;
}> = [
  {
    kind: 'incoming',
    label: 'Incoming',
    hint: `Matched fixture ${QA_FIXTURE_ORDERS.pending} (${QA_FIXTURE_ORDER_TITLES.pending})`,
  },
  {
    kind: 'exception',
    label: 'Exception',
    hint: 'Amber exception session — edit notes / serials without a live order',
  },
  {
    kind: 'unmatched',
    label: 'Not matching',
    hint: `Scan ${QA_FIXTURE_TRACKING_UNMATCHED} — not in the system`,
  },
];

export const QA_STATION_HOPS: ReadonlyArray<{ href: string; label: string }> =
  SCAN_STATION_OVERLAY_COHORT.map((m) => ({ href: m.route, label: m.label.replace(/ floor station$/i, '') }));

export function isQaStationScanKind(value: string): value is QaStationScanKind {
  return (QA_STATION_SCAN_KINDS as readonly string[]).includes(value);
}

export function dispatchQaStationScanState(kind: QaStationScanKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<QaStationScanEventDetail>(QA_STATION_SCAN_EVENT, { detail: { kind } }),
  );
}
