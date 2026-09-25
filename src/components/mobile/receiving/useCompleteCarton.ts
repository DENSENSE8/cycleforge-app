'use client';

/**
 * "Complete carton" — the phone's receive action.
 *
 * Posts ONE carton-scoped request to `/api/receiving/mark-received-po`
 * (`receiving_id`), not a per-line loop. That route already owns the whole
 * receive: every open line under the carton, the photo-policy gate, audit, and
 * the realtime fan-out the desktop bench listens to. A per-line QA verdict
 * (pass / fail) is a different job — on the phone that is the QC scan kernel
 * (`/m/r/[id]/qc` → `/m/qc/line/[id]`) — so receiving composes the bulk route
 * instead of looping `mark-received` per line.
 *
 * Two things this shell exists to get right (the request/response decisions
 * themselves live in `./complete-carton`, pure and tested):
 *
 * 1. **One idempotency key, reused across retries.** The route reserves the
 *    claim up front, so a network blip + retry replays the prior response
 *    instead of double-calling Zoho. The key is minted once per carton attempt
 *    and deliberately survives a PHOTO_POLICY block — that path RELEASES the
 *    claim server-side precisely so the same key can retry once the operator
 *    adds the missing photos. It resets only after a success.
 *
 * 2. **A 200 means the receive committed.** The inventory purchase receive is
 *    no longer part of this request: the scheduled receive backfill drains it
 *    and owns its own backlog surface. So the carton settles the moment the
 *    response lands — there is nothing external left to wait on, and no
 *    per-line sync signal to render.
 */

import { useCallback, useRef, useState } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  COMPLETE_CARTON_IDLE,
  completeCartonRequestBody,
  mapCompleteCartonResponse,
  type CompleteCartonOutcome,
  type CompleteCartonRow,
} from '@/components/mobile/receiving/complete-carton';
import { photoPolicyOverrideField } from '@/lib/receiving/photo-policy-override-wire';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';

export function useCompleteCarton(row: CompleteCartonRow | null) {
  const [state, setState] = useState<CompleteCartonOutcome>(COMPLETE_CARTON_IDLE);
  // Held across retries — see (1) in the module doc.
  const idempotencyKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    idempotencyKeyRef.current = null;
    setState(COMPLETE_CARTON_IDLE);
  }, []);

  /**
   * Receive the carton.
   *
   * `photoPolicyOverride` is how a blocked carton gets through, and it is
   * passed ONLY by the surface that just showed the operator the waiver sheet.
   * Absent = no waiver = the gate keeps hard-blocking, which is the safe
   * default; there is deliberately no way to make a plain retry carry a code it
   * inherited from an earlier attempt.
   */
  const run = useCallback(async (photoPolicyOverride?: PhotoPolicyOverrideCode | null) => {
    const receivingId = row?.receiving_id;
    if (!row || !receivingId || inFlightRef.current) return;
    inFlightRef.current = true;
    setState((prev) => ({ ...prev, phase: 'working', error: null }));

    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = safeRandomUUID();
    // A waived retry is a genuinely different request from the blocked one, so
    // it must not replay the blocked attempt's cached response.
    if (photoPolicyOverride) idempotencyKeyRef.current = safeRandomUUID();

    try {
      const res = await fetch('/api/receiving/mark-received-po', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...completeCartonRequestBody(row, receivingId, idempotencyKeyRef.current),
          ...(photoPolicyOverride ? photoPolicyOverrideField(photoPolicyOverride) : null),
        }),
      });
      const body = await res.json().catch(() => null);
      const outcome = mapCompleteCartonResponse(res.status, body);
      // Only a success retires the key; a block or error keeps it so the retry
      // replays rather than re-running the receive.
      if (outcome.phase === 'done') idempotencyKeyRef.current = null;
      setState(outcome);
    } catch {
      setState({
        ...COMPLETE_CARTON_IDLE,
        phase: 'error',
        error: 'Network dropped — tap to retry.',
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [row]);

  return { ...state, run, reset };
}
