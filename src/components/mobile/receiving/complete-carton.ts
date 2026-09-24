/**
 * "Complete carton" — the pure half of the phone's receive action.
 *
 * Request assembly and response→state mapping live here, free of React and
 * `fetch`, so both are unit-testable (this repo has no React-hook test
 * harness — every suite is pure node:test). {@link useCompleteCarton} is the
 * thin stateful shell over these.
 */

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
  /**
   * Set when this receive went through on a photo-policy WAIVER (the operator
   * picked a `PHOTO_WAIVED_*` reason). A waived receive must never render as a
   * clean success — the carton is received carrying an open exception, and the
   * bench is the last place that can still say so.
   */
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
 * Body for `POST /api/receiving/mark-received-po`.
 *
 * `station: 'MOBILE'` tags the audit + inventory events as phone-originated
 * (the route accepts MOBILE / TECH / RECEIVING). Unfound, return, and
 * sales-order-linked cartons have no Zoho PO to receive against, so they take
 * the `local_receive` lane — which still advances the lines to RECEIVED, it
 * just never calls Zoho. That choice is delegated to the routing SoT rather
 * than re-derived from `receiving_source` here.
 */
export function completeCartonRequestBody(
  row: ReceivingLineRow,
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

/**
 * Map a `mark-received-po` response onto the operator-facing state.
 *
 * The load-bearing case is **409 `PHOTO_POLICY` is not an error**: it carries
 * the receive-time evidence gate's blockers, and it is a *fixable* condition —
 * the operator shoots the missing photos and retries the same request. Folding
 * it into the generic error branch is what the old per-line QA loop did, which
 * is why the phone never surfaced the policy at all.
 *
 * Since the gate became a soft block, the same request can also come back 200
 * carrying a `warnings[]` waiver — the receive happened, but on an override the
 * operator consciously took. That is a THIRD outcome, not a success: it is
 * reported as `done` with `waiver` set so the surface can say so out loud.
 */
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
