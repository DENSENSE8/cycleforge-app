'use client';

/**
 * The `/counter` desk client: one session, one version, one in-flight write.
 *
 * Every mutation route already answers with the **new snapshot** (P2), so this
 * hook needs no realtime transport to stay correct — it renders whatever the
 * last server answer said. P4 adds the Ably subscription on top; until then a
 * poll keeps a second desk's edits visible, which is also the exact degrade
 * path D7 requires when the channel is down. Building the poll first means the
 * fallback is the thing that has been exercised all along, rather than a branch
 * nobody runs until the day Ably breaks.
 *
 * **Writes are serialized.** `expectedVersion` comes from the snapshot in hand,
 * so two overlapping writes would send the same version and the second would
 * always lose. Queueing them behind one in-flight promise turns a guaranteed
 * 409 into a correct sequence — the conflict path stays for the case it is
 * actually for: another *device* editing the same cart.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5, ahead of P4).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import {
  applySessionEvent,
  needsResync,
  type CounterSessionEvent,
  type CounterSessionSnapshot,
} from '@/lib/counter/session-events';
import { getKioskBridgeChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { KioskLinePayload, KioskLineType } from '@/lib/kiosk/cart-line';

/**
 * Poll cadence.
 *
 * Two speeds, because the poll plays two different roles. With no channel
 * attached it IS the transport, so it runs at 3s. With the bridge live it is
 * only a safety net against a dropped publish, so it drops to 30s — frequent
 * enough that a missed event is measured in seconds, rare enough that ten
 * counters do not hammer the API for nothing.
 */
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

async function call(path: string, method: string, body?: MutationBody) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json } as const;
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
    case 'INVALID_PAYLOAD':
      return 'That line is missing a required field.';
    default:
      return status === 403 ? 'You do not have permission for that.' : 'That did not go through.';
  }
}

export function useCounterSession(sessionId: number | null) {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

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

  const mutate = useCallback(
    (path: string, method: string, body: MutationBody = {}) => {
      const run = async () => {
        const snapshot = snapshotRef.current;
        if (!snapshot) return;
        setState((s) => ({ ...s, busy: true, error: null }));

        const { ok, status, json } = await call(path, method, {
          expectedVersion: snapshot.version,
          ...body,
        });

        setState((s) => ({
          ...s,
          busy: false,
          // A conflict still carries the current snapshot (D3) — render the
          // truth rather than leaving the operator on a stale cart.
          snapshot: json?.snapshot ?? s.snapshot,
          error: ok ? null : operatorCopy(json?.error, status),
        }));
      };

      chain.current = chain.current.then(run, run);
      return chain.current;
    },
    [],
  );

  // ── The bridge (D2) ───────────────────────────────────────────────────────
  //
  // Keyed by DEVICE, so a session with no bound tablet has no channel and no
  // second screen to sync with — the poll simply stays at its degraded cadence.
  // The desk's Ably token grants only devices it holds a live lease on (P3), so
  // subscribing to a counter it does not hold fails at the token, not here.
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
  useAblyChannel(channel, 'session.submitted', onBridgeEvent, enabled, { coalesce: 'frame' });

  const id = state.snapshot?.sessionId;

  return {
    ...state,
    refresh: useCallback(() => (id ? refresh(id) : Promise.resolve()), [id, refresh]),
    claim: useCallback(
      (takeover?: boolean) => mutate(`/api/counter/session/${id}/claim`, 'POST', { takeover }),
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
  };
}
