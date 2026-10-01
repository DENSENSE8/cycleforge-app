/** A Shipped-desk package's state face — the ledger row's spine / code and the record header read the SAME face, so row and record… */

import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { deriveOutboundState, OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { outboundSignals } from '@/lib/orders/outbound-signals';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';

const STAGE_FACE: Readonly<Record<OutboundState, Pick<RecordStateFace, 'code' | 'tone' | 'icon'>>> = {
  PACKED_STAGED: { code: 'STG', tone: LIFECYCLE.packed.tone, icon: LIFECYCLE.packed.icon },
  SCANNED_OUT: { code: 'OUT', tone: LIFECYCLE.shipped.tone, icon: LIFECYCLE.shipped.icon },
  IN_CUSTODY: { code: 'TRN', tone: LIFECYCLE.shipped.tone, icon: LIFECYCLE.shipped.icon },
  DELIVERED: { code: 'DLV', tone: LIFECYCLE.shipped.tone, icon: 'package-check' },
  EXCEPTION: { code: 'EXC', tone: 'danger', icon: 'triangle-alert' },
  PROCESS_GAP: { code: 'GAP', tone: 'warning', icon: 'triangle-alert' },
  ORPHAN: { code: 'ORP', tone: 'warning', icon: 'triangle-alert' },
};

/** Open unmatched pack scan — no order line claims this box yet. */
const UNMATCHED_SCAN_FACE: RecordStateFace = {
  id: 'UNMATCHED',
  code: 'UNM',
  label: 'Unmatched scan',
  tone: 'danger',
  icon: 'triangle-alert',
  hatched: true,
};

/** The face for a package: an open unmatched scan first, else its outbound stage. */
export function shippedPackageFace(stage: OutboundState, openException: boolean): RecordStateFace {
  return openException
    ? UNMATCHED_SCAN_FACE
    : { id: stage, label: OUTBOUND_STATE_META[stage].label, ...STAGE_FACE[stage] };
}

/** The face for a loaded package record, its stage derived from its own facts (same rule as the feed). */
export function shipmentRecordFace(record: ShipmentRecord): RecordStateFace {
  const stage = deriveOutboundState(outboundSignals({
    packedAt: record.pack?.packedAt ?? null,
    shipConfirmedAt: record.shipOut?.at ?? null,
    latestStatusCategory: record.status.category,
    latestEventAt: record.status.latestEventAt,
    isTerminal: record.status.isDelivered,
    hasException: record.status.hasException,
  }));
  return shippedPackageFace(stage, record.exception != null && isOpenExceptionStatus(record.exception.status));
}

/** `orders_exceptions.status` still awaiting a decision (`open` | `resolved`). */
export function isOpenExceptionStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'open';
}

/** The list's key for a feed row: its package, else (no package on file) the scan. */
export function shippedPackageKey(row: DerivedPackerRecord): string {
  return row.package_shipment_id != null ? String(row.package_shipment_id) : `scan-${row.id}`;
}

export function shippedPackageTracking(row: DerivedPackerRecord): string {
  return (row.package_tracking || row.shipping_tracking_number || '').trim();
}
