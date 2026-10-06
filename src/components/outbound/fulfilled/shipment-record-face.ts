/** A shipped package record's state face — the record header's spine / code, derived from the record's own facts. */

import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { deriveOutboundState, OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { outboundSignals } from '@/lib/orders/outbound-signals';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';

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

/** `orders_exceptions.status` still awaiting a decision (`open` | `resolved`). */
export function isOpenExceptionStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'open';
}

/** The face for a loaded package record: an open unmatched scan first, else its outbound stage from its own facts. */
export function shipmentRecordFace(record: ShipmentRecord): RecordStateFace {
  if (record.exception != null && isOpenExceptionStatus(record.exception.status)) return UNMATCHED_SCAN_FACE;
  const stage = deriveOutboundState(outboundSignals({
    packedAt: record.pack?.packedAt ?? null,
    shipConfirmedAt: record.shipOut?.at ?? null,
    latestStatusCategory: record.status.category,
    latestEventAt: record.status.latestEventAt,
    isTerminal: record.status.isDelivered,
    hasException: record.status.hasException,
  }));
  return { id: stage, label: OUTBOUND_STATE_META[stage].label, ...STAGE_FACE[stage] };
}
