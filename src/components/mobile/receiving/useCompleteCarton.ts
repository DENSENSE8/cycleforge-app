'use client';

/**
 * "Complete carton" — the phone's receive action.
 *
 * Posts ONE carton-scoped request to `/api/receiving/mark-received-po`
 * (`receiving_id`), not a per-line loop. That route already owns the whole
 * receive: every open line under the carton, the photo-policy gate, the Zoho
 * purchase receive, audit, and the realtime fan-out the desktop bench listens
 * to. `ReceivingQaActionSheet` loops `mark-received` per line because its job
 * is a per-line QA VERDICT (pass / fail); receiving a carton is a different
 * job, so it composes the bulk route instead of forking that loop.
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
 * 2. **A 200 means the LOCAL receive committed — not that Zoho is done.** The
 *    Zoho purchase receive, and the UNBOXED→DONE promotion that stamps
 *    `received_done_at`, both run in the route's `after()`. So success copy must
 *    say the carton is received, never that the external sync finished. The
 *    desktop bench flips its Receive CTA to Print when that promotion lands and
 *    the station channel publishes `receiving-log.changed`.
 */

import { useCallback, useRef, useState } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import {
  COMPLETE_CARTON_IDLE,
  completeCartonRequestBody,
  foldSyncVerdict,
  mapCompleteCartonResponse,
  type CompleteCartonOutcome,
  type CompleteCartonSyncStatus,
} from '@/components/mobile/receiving/complete-carton';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function useCompleteCarton(row: ReceivingLineRow | null) {
  const [state, setState] = useState<CompleteCartonOutcome>(COMPLETE_CARTON_IDLE);
  const [syncStatus, setSyncStatus] = useState<CompleteCartonSyncStatus>('pending');
  // Held across retries — see (1) in the module doc.
  const idempotencyKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const { user } = useAuth();
  const orgId = user?.organizationId;
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));

  const reset = useCallback(() => {
    idempotencyKeyRef.current = null;
    setState(COMPLETE_CARTON_IDLE);
    setSyncStatus('pending');
  }, []);

  // Terminal inventory-sync verdict. The route's `after()` publishes one
  // `receiving-log.changed` per received line once the external purchase
  // receive settles — the same event the desktop bench reconciles against, so
  // both surfaces agree instead of the phone claiming success the bench hasn't
  // seen. Subscribed only while a verdict is genuinely outstanding.
  useAblyChannel(
    stationChannel,
    'receiving-log.changed',
    (msg: { data?: { rowId?: unknown; zohoReceive?: unknown } }) => {
      setSyncStatus((current) => foldSyncVerdict(current, state.lineIds, msg?.data));
    },
    Boolean(stationChannel) && state.phase === 'done' && state.awaitsSync,
  );

  const run = useCallback(async () => {
    const receivingId = row?.receiving_id;
    if (!row || !receivingId || inFlightRef.current) return;
    inFlightRef.current = true;
    setState((prev) => ({ ...prev, phase: 'working', error: null }));

    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = safeRandomUUID();

    try {
      const res = await fetch('/api/receiving/mark-received-po', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          completeCartonRequestBody(row, receivingId, idempotencyKeyRef.current),
        ),
      });
      const body = await res.json().catch(() => null);
      const outcome = mapCompleteCartonResponse(res.status, body);
      // Only a success retires the key; a block or error keeps it so the retry
      // replays rather than re-running the receive.
      if (outcome.phase === 'done') idempotencyKeyRef.current = null;
      // A retry after a failed sync must not inherit the old verdict.
      setSyncStatus('pending');
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

  return { ...state, syncStatus, run, reset };
}
