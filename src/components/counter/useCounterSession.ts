'use client';

/** The `/counter` desk client: */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  applySessionEvent,
  needsResync,
  type CounterSessionEvent,
  type CounterSessionSnapshot,
} from '@/lib/counter/session-events';
import { getKioskBridgeChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import type { KioskLinePayload, KioskLineType } from '@/lib/kiosk/cart-line';

/** Poll cadence. */
const POLL_MS_DEGRADED = 3_000;
const POLL_MS_LIVE = 30_000;

interface CounterSessionState {
  snapshot: CounterSessionSnapshot | null;
  loading: boolean;
  /** Last refusal from the server, already mapped to operator copy. */
  error: string | null;
  busy: boolean;
  /** True once an event has actually ARRIVED on the bridge. */
  live: boolean;
}

interface MutationBody {
  [key: string]: unknown;
}

/** What a write answers with — `json` so submit can reach past the snapshot. */
interface MutationResult {
  ok: boolean;
  json: { snapshot?: CounterSessionSnapshot; transaction?: CounterTransactionResult; error?: string };
}

/** One request. `requestStepUp` is threaded through rather than captured so the four money verbs (create is not one; submit, checkout and… */
async function call(
  path: string,
  method: string,
  body?: MutationBody,
  requestStepUp?: (scope: string) => Promise<boolean>,
) {
  const init: RequestInit = {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  };
  const res = requestStepUp
    ? await fetchWithStepUp(path, init, requestStepUp)
    : await fetch(path, init);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json } as const;
}

/** Open a visit. */
export async function createCounterSession(
  kioskDeviceId?: number | null,
): Promise<{ sessionId: number } | { error: string }> {
  const { ok, status, json } = await call('/api/counter/session', 'POST', {
    clientEventId: safeRandomUUID(),
    kioskDeviceId: kioskDeviceId ?? null,
  });
  const sessionId = json?.snapshot?.sessionId;
  if (ok && typeof sessionId === 'number') return { sessionId };
  return { error: operatorCopy(json?.error, status) };
}

/** Server refusal → what an operator standing at the counter needs to read. */
function operatorCopy(code: string | undefined, status: number): string {
  switch (code) {
    case 'VERSION_CONFLICT':
      return 'Someone else changed this cart — reloaded to their version.';
    case 'CLAIMED_BY_OTHER':
      return 'Another staffer holds this counter. Use Take over to claim it.';
    case 'SESSION_CLOSED':
      return 'This visit is parked or finished — resume it to keep editing.';
    case 'LINE_NOT_FOUND':
      return 'That line is already gone.';
    case 'NOT_FOUND':
      return 'Session not found.';
    case 'DEVICE_FORBIDDEN':
      return 'Not allowed from this device.';
    case 'DEVICE_BUSY':
      return 'That tablet is already on another visit. Finish or park that one first.';
    case 'INVALID_PAYLOAD':
      return 'That line is missing a required field.';

    // ── The money verbs. Each of these is read by someone standing in front of
    // a customer with a card in their hand, so each says what to DO next.
    case 'EMPTY_CART':
      return 'Add a line before taking payment.';
    case 'MISSING_CUSTOMER':
      return 'Needs a phone number before taking payment.';
    case 'UNSIGNED_REPAIR':
      return 'The repair still needs the customer’s signature.';
    case 'NOT_CLAIMED':
      return 'Claim this counter before finishing the visit.';
    case 'NOT_SUBMITTED':
      return 'Finish the visit first — the card comes after.';
    case 'NO_STAGED_ORDER':
      return 'Nothing to charge — no payable order was staged for this visit.';
    case 'NO_TERMINAL_PAIRED':
      return 'No card reader is paired to this counter. Pair one in settings.';
    case 'ALREADY_AWAITING_CARD':
      return 'The reader is already waiting for this card. Cancel it there first.';
    case 'TERMINAL_REFUSED':
      return 'The card reader refused the request. Check it is on and connected.';
    case 'SUBMIT_REJECTED':
      return 'The visit could not be finished. Nothing was charged.';
    case 'STEPUP_REQUIRED':
      return 'That needs a PIN — the prompt was cancelled.';
    default:
      return status === 403 ? 'You do not have permission for that.' : 'That did not go through.';
  }
}

export function useCounterSession(sessionId: number | null) {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const requestStepUp = useStepUp();

  const [state, setState] = useState<CounterSessionState>({
    snapshot: null,
    loading: false,
    error: null,
    busy: false,
    live: false,
  });

  // One write at a time — see the docblock. `useRef` so a re-render mid-flight
  // does not start a second chain.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const snapshotRef = useRef<CounterSessionSnapshot | null>(null);
  snapshotRef.current = state.snapshot;

  const refresh = useCallback(async (id: number) => {
    const { ok, json } = await call(`/api/counter/session/${id}`, 'GET');
    if (ok && json?.snapshot) {
      setState((s) => ({ ...s, snapshot: json.snapshot, loading: false }));
    } else {
      setState((s) => ({ ...s, loading: false, error: operatorCopy(json?.error, 404) }));
    }
  }, []);

  useEffect(() => {
    if (sessionId === null) {
      setState({ snapshot: null, loading: false, error: null, busy: false, live: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    void refresh(sessionId);

    // The D7 fallback, running from day one rather than waiting for an outage —
    // so the degraded path is the one that has been exercised all along.
    const timer = setInterval(
      () => void refresh(sessionId),
      liveRef.current ? POLL_MS_LIVE : POLL_MS_DEGRADED,
    );
    return () => clearInterval(timer);
  }, [sessionId, refresh, state.live]);

  /** `stepUp` is opt-in per verb, not global: */
  const mutate = useCallback(
    (path: string, method: string, body: MutationBody = {}, stepUp = false) => {
      const run = async (): Promise<MutationResult> => {
        const snapshot = snapshotRef.current;
        if (!snapshot) return { ok: false, json: {} };
        setState((s) => ({ ...s, busy: true, error: null }));

        const { ok, status, json } = await call(
          path,
          method,
          { expectedVersion: snapshot.version, ...body },
          stepUp ? requestStepUp : undefined,
        );

        setState((s) => ({
          ...s,
          busy: false,
          // A conflict still carries the current snapshot (D3) — render the
          // truth rather than leaving the operator on a stale cart.
          snapshot: json?.snapshot ?? s.snapshot,
          error: ok ? null : operatorCopy(json?.error, status),
        }));
        return { ok, json };
      };

      const next = chain.current.then(run, run);
      chain.current = next;
      return next;
    },
    [requestStepUp],
  );

  // ── The bridge (D2) ───────────────────────────────────────────────────────
  const deviceId = state.snapshot?.kioskDeviceId ?? null;
  const channel = useMemo(
    () =>
      deviceId === null || !orgId
        ? ''
        : safeChannelName(() => getKioskBridgeChannelName(orgId, deviceId)),
    [orgId, deviceId],
  );

  const liveRef = useRef(false);
  liveRef.current = state.live;

  const onBridgeEvent = useCallback(
    (message: { name?: string; data?: unknown }) => {
      const event = message?.data as CounterSessionEvent | undefined;
      if (!event || typeof event.version !== 'number') return;

      setState((s) => {
        if (!s.snapshot) return s;
        const result = applySessionEvent(s.snapshot, event);
        if (result.applied) {
          return { ...s, snapshot: result.snapshot, live: true };
        }
        // A gap means we missed an event — refetch rather than guess. Duplicates
        // and foreign events are dropped silently; that is the reducer's whole job.
        if (needsResync(result)) void refresh(s.snapshot.sessionId);
        return { ...s, live: true };
      });
    },
    [refresh],
  );

  // One subscription per event name the bridge carries. `coalesce: 'frame'`
  // because house law forbids a setState per Ably message during a burst —
  // adding four lines at once must repaint once, not four times.
  const enabled = !!channel;
  useAblyChannel(channel, 'line.added', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'line.updated', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'line.voided', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.customer_changed', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.status_changed', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.claimed', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.released', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.device_bound', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.face_changed', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.presentation_changed', onBridgeEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, 'session.submitted', onBridgeEvent, enabled, { coalesce: 'frame' });

  const id = state.snapshot?.sessionId;

  return {
    ...state,
    refresh: useCallback(() => (id ? refresh(id) : Promise.resolve()), [id, refresh]),
    claim: useCallback(
      (takeover?: boolean) => mutate(`/api/counter/session/${id}/claim`, 'POST', { takeover }),
      [id, mutate],
    ),
    /** Put this visit on a tablet, or hand the tablet back with `null`. */
    bindDevice: useCallback(
      (kioskDeviceId: number | null) =>
        mutate(`/api/counter/session/${id}/device`, 'POST', { kioskDeviceId }),
      [id, mutate],
    ),
    setConsultStance: useCallback(
      (consultStance: 'work' | 'show' | 'verify') =>
        mutate(`/api/counter/session/${id}/stance`, 'POST', { consultStance }),
      [id, mutate],
    ),
    setPresentation: useCallback(
      (presentation: { lineId: string | null; catalog: unknown }) =>
        mutate(`/api/counter/session/${id}/presentation`, 'POST', { presentation }),
      [id, mutate],
    ),
    release: useCallback(
      () => mutate(`/api/counter/session/${id}/release`, 'POST', { reason: 'done' }),
      [id, mutate],
    ),
    addLine: useCallback(
      (line: {
        lineUuid: string;
        type: KioskLineType;
        title: string;
        quantity: number;
        unitAmountCents: number;
        payload: KioskLinePayload;
        sortIndex: number;
      }) => mutate(`/api/counter/session/${id}/lines`, 'POST', line),
      [id, mutate],
    ),
    updateLine: useCallback(
      (lineUuid: string, patch: { quantity?: number; unitAmountCents?: number; title?: string }) =>
        mutate(`/api/counter/session/${id}/lines/${lineUuid}`, 'PATCH', patch),
      [id, mutate],
    ),
    voidLine: useCallback(
      (lineUuid: string, reason: string) =>
        mutate(`/api/counter/session/${id}/lines/${lineUuid}`, 'DELETE', { reason }),
      [id, mutate],
    ),
    setCustomer: useCallback(
      (customer: { phone: string; name: string; email: string }) =>
        mutate(`/api/counter/session/${id}/customer`, 'PATCH', customer),
      [id, mutate],
    ),
    setStatus: useCallback(
      (status: 'open' | 'parked' | 'voided') =>
        mutate(`/api/counter/session/${id}/status`, 'POST', { status }),
      [id, mutate],
    ),

    // ── The money verbs ──────────────────────────────────────────────────────

    /** Override a line price. */
    setLinePrice: useCallback(
      (lineUuid: string, unitAmountCents: number, reason?: string) =>
        mutate(
          `/api/counter/session/${id}/lines/${lineUuid}/price`,
          'POST',
          { unitAmountCents, reason: reason ?? null },
          true,
        ),
      [id, mutate],
    ),

    /** Finish the visit: */
    submit: useCallback(
      () => mutate(`/api/counter/session/${id}/submit`, 'POST', {}, true),
      [id, mutate],
    ),

    /**
     * Ask the Square Terminal for a card. Runs AFTER submit — the order a
     * checkout collects against does not exist until the visit is submitted.
     */
    checkout: useCallback(
      (deviceId?: string) =>
        mutate(
          `/api/counter/session/${id}/checkout`,
          'POST',
          deviceId ? { deviceId } : {},
          true,
        ),
      [id, mutate],
    ),
  };
}
