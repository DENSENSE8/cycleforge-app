/** A Shipped-desk package's state face — the ledger row's spine / code and the record's status strip read the SAME face, so row and record… */

import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { deriveOutboundState, OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { outboundSignals, type OutboundSignalFacts } from '@/lib/orders/outbound-signals';

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
export const UNMATCHED_SCAN_FACE: RecordStateFace = {
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

/** Derive the outbound stage from the record's own facts (same rule as the feed). */
export function shipmentOutboundStage(facts: OutboundSignalFacts): OutboundState {
  return deriveOutboundState(outboundSignals(facts));
}

/** `orders_exceptions.status` still awaiting a decision (`open` | `resolved`). */
export function isOpenExceptionStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'open';
}
