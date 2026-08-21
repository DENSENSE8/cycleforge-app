'use client';

/**
 * The tablet half of the bridge: mirror whatever the desk is doing.
 *
 * Three moving parts, in the order they matter:
 *
 *  1. **Ask about yourself.** `GET /api/kiosk/session` answers with the session
 *     bound to THIS device — the tablet never names a session id — plus the
 *     channel it should listen on. It cannot build that name itself: it is
 *     `org:{orgId}:kiosk:{deviceId}` and the device knows neither id (its
 *     principal lives in an httpOnly cookie).
 *  2. **Subscribe.** Every event lands in `applySessionEvent` against a local
 *     snapshot, so a duplicate is dropped and a gap triggers a refetch instead
 *     of painting a cart that skipped a line.
 *  3. **Mirror.** The projection goes into `kioskSessionStore`, which every
 *     existing kiosk pane already reads. Nothing downstream knows the transport
 *     changed.
 *
 * The poll stays as the D7 floor — 3s with no channel, 30s once events arrive.
 * A tablet that loses its socket keeps showing the right cart, a few seconds
 * behind, which is the difference between a degraded counter and a stopped one.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P4b · D1 · D2 · D6 · D7).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  applySessionEvent,
  emptySessionSnapshot,
  needsResync,
  type CounterSessionEvent,
  type CounterSessionSnapshot,
  type DeviceSessionProjection,
} from '@/lib/counter/session-events';
import { kioskSessionStore } from '@/lib/kiosk/kiosk-session-store';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';

const POLL_MS_DEGRADED = 3_000;
const POLL_MS_LIVE = 30_000;

/** Events the tablet reacts to. Lease churn is desk chrome — it ignores it. */
const BRIDGE_EVENTS = [
  'line.added',
  'line.updated',
  'line.voided',
  'session.customer_changed',
  'session.status_changed',
  'session.submitted',
  // The card prompt — the one event whose whole purpose is the customer's screen.
  'session.payment_changed',
] as const;

export interface KioskSharedSessionState {
  /** Null = no desk holds this tablet; it keeps its own local cart. */
  sessionId: number | null;
  live: boolean;
}

/**
 * A projection is what the tablet is allowed to see, so it is also all it can
 * mirror. The local snapshot below exists purely to run the version reducer;
 * only its lines and identity reach the store.
 */
function snapshotFromProjection(p: DeviceSessionProjection): CounterSessionSnapshot {
  return {
    ...emptySessionSnapshot(p.sessionId),
    version: p.version,
    status: p.status,
    activeCommand: p.activeCommand,
    face: p.face,
    customer: { phone: '', name: p.customerName, email: '' },
    lines: p.lines.map((l, i) => ({
      ...l,
      sortIndex: i,
      voidedAtMs: null,
      voidReason: null,
      voidedByStaffId: null,
    })),
  };
}

function mirror(
  snapshot: CounterSessionSnapshot,
  masked: string,
  awaiting: string[],
  awaitingCardSinceMs: number | null,
): void {
  const lines: KioskCartLine[] = snapshot.lines.map((l) => ({
    id: l.id,
    type: l.type,
    title: l.title,
    quantity: l.quantity,
    unitAmountCents: l.unitAmountCents,
    payload: l.payload,
  }));
  kioskSessionStore.mirrorSharedSession({
    sessionId: snapshot.sessionId,
    version: snapshot.version,
    lines,
    customerName: snapshot.customer.name,
    customerPhoneMasked: masked,
    awaitingSignatureLineIds: awaiting,
    activeCommand: snapshot.activeCommand,
    awaitingCardSinceMs,
  });
}

/**
 * The write-through path for a co-edited visit.
 *
 * `expectedVersion` is read at SEND time from the mirror, not captured when the
 * component rendered — the desk is editing the same cart, so a version captured
 * a second ago is already stale and would 409 every time.
 */
function makeWriter(getVersion: () => number, onWrote: () => void) {
  const send = async (path: string, method: string, body: Record<string, unknown>) => {
    await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: getVersion(), ...body }),
    }).catch(() => {
      /* The mirror is the reconciler: a failed send is corrected by the next
         projection, which is also what puts a refused edit back on screen. */
    });
    onWrote();
  };

  return {
    addLine: (line: Parameters<typeof kioskSessionStore.addLine>[0] & { id: string }) =>
      send('/api/kiosk/session/lines', 'POST', {
        lineUuid: line.id,
        type: line.type,
        title: line.title,
        quantity: line.quantity,
        payload: line.payload,
        sortIndex: 0,
      }),
    updateLine: (id: string, patch: Record<string, unknown>) =>
      send(`/api/kiosk/session/lines/${id}`, 'PATCH', {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.payload !== undefined
          ? { payload: patch.payload, payloadType: (patch as { type?: string }).type }
          : {}),
      }),
    removeLine: (_id: string) => {
      // Deliberately not sent: a remove is a VOID, and a void is staff work
      // (P7). The next mirror restores the line, so the customer sees it come
      // back rather than a control that quietly did nothing.
      onWrote();
    },
  };
}

export function useKioskSharedSession(): KioskSharedSessionState {
  const [channel, setChannel] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  // The reducer's working copy. A ref, not state: the STORE is the render
  // surface, and duplicating it in React state would give the panes two
  // sources of truth for the same cart.
  const snapshotRef = useRef<CounterSessionSnapshot | null>(null);
  const maskedRef = useRef('');
  const liveRef = useRef(false);
  liveRef.current = live;

  const refresh = useCallback(async () => {
    const res = await fetch('/api/kiosk/session', { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as {
      session?: DeviceSessionProjection | null;
      channel?: string;
    };

    if (json.channel) setChannel(json.channel);

    if (!json.session) {
      // The desk let go (or never held this tablet): hand the cart back to the
      // local transport rather than leaving the last visit on the screen.
      snapshotRef.current = null;
      maskedRef.current = '';
      setSessionId(null);
      kioskSessionStore.detachSharedSession();
      return;
    }

    const snapshot = snapshotFromProjection(json.session);
    snapshotRef.current = snapshot;
    maskedRef.current = json.session.customerPhoneMasked;
    setSessionId(snapshot.sessionId);
    mirror(
      snapshot,
      maskedRef.current,
      json.session.awaitingSignatureLineIds,
      json.session.awaitingCardSinceMs,
    );
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(
      () => void refresh(),
      liveRef.current ? POLL_MS_LIVE : POLL_MS_DEGRADED,
    );
    return () => clearInterval(timer);
  }, [refresh, live]);

  const onEvent = useCallback(
    (message: { data?: unknown }) => {
      const event = message?.data as CounterSessionEvent | undefined;
      const current = snapshotRef.current;
      if (!event || typeof event.version !== 'number' || !current) return;

      setLive(true);
      const result = applySessionEvent(current, event);
      if (result.applied) {
        snapshotRef.current = result.snapshot;
        // The awaiting-signature list is derived from the same lines, so it
        // follows the mirror rather than needing its own event.
        const awaiting = result.snapshot.lines
          .filter((l) => l.type === 'REPAIR' && !(l.payload as { signatureDataUrl?: string | null })?.signatureDataUrl)
          .map((l) => l.id);
        mirror(result.snapshot, maskedRef.current, awaiting, result.snapshot.awaitingCardSinceMs);
        return;
      }
      if (needsResync(result)) void refresh();
    },
    [refresh],
  );

  // Install the write-through path whenever a session is attached, and clear it
  // the moment it is not — a stale writer could post into a session this tablet
  // no longer belongs to.
  useEffect(() => {
    if (sessionId === null) {
      kioskSessionStore.attachSharedWriter(null);
      return;
    }
    kioskSessionStore.attachSharedWriter(
      makeWriter(
        () => snapshotRef.current?.version ?? 0,
        () => void refresh(),
      ),
    );
    return () => kioskSessionStore.attachSharedWriter(null);
  }, [sessionId, refresh]);

  const enabled = !!channel;
  // `coalesce: 'frame'` — house law forbids a setState (or a store write) per
  // Ably message during a burst; four lines added at once repaint once.
  useAblyChannel(channel, BRIDGE_EVENTS[0], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[1], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[2], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[3], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[4], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[5], onEvent, enabled, { coalesce: 'frame' });
  useAblyChannel(channel, BRIDGE_EVENTS[6], onEvent, enabled, { coalesce: 'frame' });

  return { sessionId, live };
}
