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
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

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
   * Receiving-line ids the route touched. The background sync publishes one
   * `receiving-log.changed` per line carrying its terminal `zohoReceive`
   * verdict, keyed by `rowId` = line id — this is the set to match against.
   */
  lineIds: number[];
  /**
   * A terminal inventory-sync verdict is still coming. True only for a real
   * `zoho_receive` that actually touched lines: a `local_receive` (unfound /
   * return carton) has no external receive to reconcile and a verify-only
   * replay publishes nothing, so neither may leave the UI waiting forever.
   */
  awaitsSync: boolean;
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
  lineIds: [],
  awaitsSync: false,
  waiver: null,
};

/** Shown when the gate blocks but sends no readable reason (shouldn't happen). */
export const COMPLETE_CARTON_GENERIC_BLOCKER =
  'This carton still needs photos before it can be received.';

/** Terminal inventory-sync verdict for the receive, folded across its lines. */
export type CompleteCartonSyncStatus = 'pending' | 'ok' | 'failed';

/**
 * Fold one incoming `receiving-log.changed` verdict into the running status.
 *
 * Mirrors the desktop reconciler (`ReceiveFeedbackRegion`): ignore anything
 * that is not an `ok` / `failed` verdict for a line we received — `'skipped'`
 * and ordinary row updates carry no verdict and must not move the state.
 *
 * Diverges in one deliberate way: **failure is sticky**. A carton receives N
 * lines and gets N verdicts, so "whichever arrived first wins" can report a
 * green sync for a carton that had a line fail. Once anything fails, it stays
 * failed until the operator retries.
 */
export function foldSyncVerdict(
  current: CompleteCartonSyncStatus,
  lineIds: readonly number[],
  event: { rowId?: unknown; zohoReceive?: unknown } | null | undefined,
): CompleteCartonSyncStatus {
  const verdict = event?.zohoReceive;
  if (verdict !== 'ok' && verdict !== 'failed') return current;
  const rowId = Number(event?.rowId);
  if (!Number.isFinite(rowId) || !lineIds.includes(rowId)) return current;
  if (current === 'failed') return current;
  return verdict === 'ok' ? 'ok' : 'failed';
}

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

/** `receiving_lines[].id` → the ids the sync will publish verdicts for. */
function readLineIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const raw of value) {
    const id = Number((raw as { id?: unknown } | null)?.id);
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  return ids;
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
    receive_intent?: unknown;
    receiving_lines?: unknown;
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
  const lineIds = readLineIds(payload.receiving_lines);
  return {
    phase: 'done',
    blockers: [],
    error: null,
    updatedCount: Number.isFinite(updated) && updated > 0 ? updated : 0,
    lineIds,
    // Only a real external receive publishes a verdict, and only for lines it
    // actually touched.
    awaitsSync: payload.receive_intent === 'zoho_receive' && lineIds.length > 0,
    waiver: readPhotoPolicyWaiver(body),
  };
}
