'use client';

/** "Complete carton" — the phone's receive action. */

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

  /** Receive the carton. */
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
