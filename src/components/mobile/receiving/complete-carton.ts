/** "Complete carton" — the pure half of the phone's receive action. */

import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import {
  readPhotoPolicyBlock,
  readPhotoPolicyWaiver,
  type PhotoPolicyWaiver,
} from '@/lib/receiving/photo-policy-override-wire';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export type CompleteCartonPhase = 'idle' | 'working' | 'blocked' | 'done' | 'error';

export interface CompleteCartonOutcome {
  phase: CompleteCartonPhase;
  /** Photo-policy blockers from a 409 — operator-readable, already formatted. */
  blockers: string[];
  /** Non-policy failure message. */
  error: string | null;
  /** Lines the route reported as received (0 on a verify/replay pass). */
  updatedCount: number;
  /** Set when this receive went through on a photo-policy WAIVER (the operator picked a `PHOTO_WAIVED_*` reason). */
  waiver: PhotoPolicyWaiver | null;
}

export const COMPLETE_CARTON_IDLE: CompleteCartonOutcome = {
  phase: 'idle',
  blockers: [],
  error: null,
  updatedCount: 0,
  waiver: null,
};

/** Shown when the gate blocks but sends no readable reason (shouldn't happen). */
export const COMPLETE_CARTON_GENERIC_BLOCKER =
  'This carton still needs photos before it can be received.';

export interface CompleteCartonRequest {
  receiving_id: number;
  receive_intent: 'zoho_receive' | 'local_receive';
  station: 'MOBILE';
  client_event_id: string;
}

/**
 * The carton facts the receive lane reads — exactly what the routing SoT
 * (`shouldUseLocalReceiveOnly`) needs, so the carton hub can build it from the
 * carton read instead of pretending to hold a full line row.
 */
export type CompleteCartonRow = Pick<
  ReceivingLineRow,
  'receiving_id' | 'receiving_source' | 'zoho_purchaseorder_id' | 'intake_type' | 'receiving_type' | 'carton_intake_type'
>;

/** Body for `POST /api/receiving/mark-received-po`. */
export function completeCartonRequestBody(
  row: CompleteCartonRow,
  receivingId: number,
  clientEventId: string,
): CompleteCartonRequest {
  return {
    receiving_id: receivingId,
    receive_intent: shouldUseLocalReceiveOnly(row) ? 'local_receive' : 'zoho_receive',
    station: 'MOBILE',
    client_event_id: clientEventId,
  };
}

/** Map a `mark-received-po` response onto the operator-facing state. */
export function mapCompleteCartonResponse(
  status: number,
  body: unknown,
): CompleteCartonOutcome {
  const payload = (body ?? {}) as {
    success?: boolean;
    error?: string;
    updated_count?: unknown;
  };

  const block = readPhotoPolicyBlock(status, body);
  if (block) {
    return {
      ...COMPLETE_CARTON_IDLE,
      phase: 'blocked',
      blockers: block.blockers.length > 0 ? block.blockers : [COMPLETE_CARTON_GENERIC_BLOCKER],
    };
  }

  const ok = status >= 200 && status < 300;
  if (!ok || payload.success !== true) {
    return {
      ...COMPLETE_CARTON_IDLE,
      phase: 'error',
      error: String(payload.error || '').trim() || `Receive failed (${status})`,
    };
  }

  const updated = Number(payload.updated_count);
  return {
    phase: 'done',
    blockers: [],
    error: null,
    updatedCount: Number.isFinite(updated) && updated > 0 ? updated : 0,
    waiver: readPhotoPolicyWaiver(body),
  };
}
