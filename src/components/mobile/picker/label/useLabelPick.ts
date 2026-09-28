'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useOrderPickTasks } from '@/hooks/fulfillment/useSubstitution';
import {
  addDeskSerial,
  resolveDeskScanType,
  scanDeskSku,
  scanDeskTracking,
  undoLastDeskStep,
  unpickDeskOrder,
} from '@/lib/picking/desk-scan-client';
import type { PickTaskRow } from '@/lib/picking/sessions';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { playScanTone, vibrateScan, type ScanFeedbackKind } from '@/lib/scan-feedback/play';

export interface LabelPickMessage {
  tone: 'error' | 'warning' | 'success' | 'info';
  text: string;
}

/** The order-level pick fact the card shows; null = not picked. */
export interface LabelPickState {
  byName: string | null;
  at: string | null;
}

/** One serial row on the card: an allocated unit still to pick, or a serial on the scan session. */
export interface LabelPickSerialRow {
  serial: string;
  state: 'to-pick' | 'picked' | 'scanned';
  bin: string | null;
}

function feedback(kind: ScanFeedbackKind): void {
  playScanTone(kind);
  vibrateScan(kind);
}

/**
 * The phone's label pick — the Picker desk's scan flow on `/m/pick?mode=label`
 * (owner 2026-09-28: a phone picks the same way as desktop, printed label
 * included). Label → order card + pick scan; serial / SKU against the card;
 * Undo last step; Unpick order. Every write goes through `desk-scan-client`,
 * the same module the desk controller calls.
 */
export function useLabelPick() {
  const { user, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const [card, setCard] = useState<ActiveStationOrder | null>(null);
  const [picked, setPicked] = useState<LabelPickState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<LabelPickMessage | null>(null);
  /** Every allocation serial seen on this card — one that leaves the open list was picked. */
  const [expected, setExpected] = useState<Map<string, PickTaskRow>>(new Map());

  const orderId = card?.id ?? null;
  const tasksQuery = useOrderPickTasks(orderId);
  const openTasks = tasksQuery.data?.tasks;

  useEffect(() => {
    if (!openTasks?.length) return;
    setExpected((prev) => {
      const missing = openTasks.filter((t) => t.serialNumber && !prev.has(t.serialNumber.toUpperCase()));
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      for (const t of missing) next.set(t.serialNumber!.toUpperCase(), t);
      return next;
    });
  }, [openTasks]);

  const refreshTasks = useCallback(() => {
    if (orderId) void queryClient.invalidateQueries({ queryKey: ['order-pick-tasks', orderId] });
    refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
  }, [orderId, queryClient]);

  // The same realtime event the desk tables patch from: `order.picked` —
  // `picked: false` when a reversal takes the order back out of the lane.
  const ordersChannel = safeChannelName(() => getOrdersChannelName(user!.organizationId));
  useAblyChannel(
    ordersChannel,
    'order.picked',
    (msg: { data?: { orderId?: unknown; picked?: boolean; pickedByName?: string | null; pickedAt?: string | null } }) => {
      const data = msg?.data;
      if (!orderId || Number(data?.orderId) !== orderId) return;
      // A forward pick omits `picked`; a reversal carries the stage-facts truth.
      setPicked((prev) =>
        data?.picked === false
          ? null
          : { byName: data?.pickedByName ?? prev?.byName ?? null, at: data?.pickedAt ?? prev?.at ?? null },
      );
      if (data?.picked === false && picked) {
        setMessage({ tone: 'info', text: `${card?.orderId ?? 'This order'} was unpicked — scan the label to re-pick` });
      }
      void queryClient.invalidateQueries({ queryKey: ['order-pick-tasks', orderId] });
    },
    !!ordersChannel && orderId != null,
  );

  const loadCard = useCallback(
    (next: ActiveStationOrder | null) => {
      if (!next || next.id !== card?.id) setExpected(new Map());
      setCard(next);
    },
    [card?.id],
  );

  const run = useCallback(
    async (value: string) => {
      // A card whose pick was reversed (here or on another device) has no live
      // scan anchor: the next scan is the label again, never a serial on it.
      const live = card && (picked || card.orderFound === false) ? card : null;
      const type = live ? resolveDeskScanType(value, live) : 'TRACKING';
      const idempotencyKey = safeRandomUUID();

      if (type === 'TRACKING') {
        const result = await scanDeskTracking(value, { idempotencyKey });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        loadCard(result.order);
        if (result.data.orderFound) {
          setPicked({ byName: user?.name ?? null, at: new Date().toISOString() });
          feedback('success');
          setMessage(result.message ? { tone: 'success', text: result.message } : null);
        } else {
          setPicked(null);
          feedback('warn');
          setMessage({ tone: 'warning', text: result.order.inlineMicrocopy ?? 'Order not in system' });
        }
        return;
      }

      if (type === 'SERIAL') {
        const result = await addDeskSerial({
          input: value,
          contextOrder: card,
          scanSessionId: card?.scanSessionId ?? null,
          idempotencyKey,
        });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        if (result.order) loadCard(result.order);
        feedback(result.pickWarning ? 'warn' : 'success');
        setMessage(
          result.pickWarning
            ? { tone: 'warning', text: `${result.message} · ${result.pickWarning}` }
            : { tone: 'success', text: result.message },
        );
        return;
      }

      if (type === 'SKU') {
        const result = await scanDeskSku({
          input: value,
          contextOrder: card,
          scanSessionId: card?.scanSessionId ?? null,
          idempotencyKey,
        });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        loadCard(result.order);
        feedback('success');
        setMessage({ tone: 'success', text: result.notes ? `${result.message} · ${result.notes}` : result.message });
        return;
      }

      feedback('reject');
      setMessage({ tone: 'error', text: `"${value}" is not a label, serial or SKU code` });
    },
    [card, picked, loadCard, user?.name],
  );

  const handleScan = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value || busy) return;
      setBusy(true);
      void run(value).finally(() => {
        setBusy(false);
        refreshTasks();
      });
    },
    [busy, run, refreshTasks],
  );

  // Hardware scanner: claim every wedge read on this screen so a label is a
  // pick scan here, never a navigation to the order's page.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string }>).detail;
      if (!detail?.value) return;
      event.preventDefault();
      handleScan(detail.value);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [handleScan]);

  const undo = useCallback(async () => {
    if (!card || busy || (!picked && card.orderFound !== false)) return;
    setBusy(true);
    try {
      const result = await undoLastDeskStep({ order: card, idempotencyKey: safeRandomUUID() });
      if (!result.ok) {
        feedback('reject');
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      loadCard(result.order);
      if (!result.order) setPicked(null);
      feedback('success');
      setMessage({ tone: 'info', text: result.message });
    } finally {
      setBusy(false);
      refreshTasks();
    }
  }, [card, picked, busy, loadCard, refreshTasks]);

  const unpick = useCallback(async () => {
    if (!card?.id || busy) return;
    setBusy(true);
    try {
      const result = await unpickDeskOrder({ orderId: card.id, orderLabel: card.orderId });
      if (!result.ok) {
        feedback('reject');
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      refreshTasks();
      loadCard(null);
      setPicked(null);
      feedback('success');
      setMessage({ tone: 'info', text: result.message });
    } finally {
      setBusy(false);
    }
  }, [card, busy, loadCard, refreshTasks]);

  const openSerials = new Set((openTasks ?? []).map((t) => t.serialNumber?.toUpperCase()).filter(Boolean));
  const scanned = new Set((card?.serialNumbers ?? []).map((s) => s.toUpperCase()));
  const serialRows: LabelPickSerialRow[] = [
    ...[...expected.values()].map((t) => {
      const serial = t.serialNumber!.toUpperCase();
      return { serial, bin: t.bin, state: openSerials.has(serial) ? ('to-pick' as const) : ('picked' as const) };
    }),
    ...[...scanned]
      .filter((s) => !expected.has(s))
      .map((serial) => ({ serial, bin: null, state: 'scanned' as const })),
  ];

  return {
    isLoaded,
    signedIn: !!user,
    card,
    picked,
    /** The card has a live scan anchor — serials, SKU codes and Undo act on it. */
    live: card != null && (picked != null || card.orderFound === false),
    busy,
    message,
    dismissMessage: () => setMessage(null),
    serialRows,
    tasksLoading: tasksQuery.isPending && orderId != null,
    handleScan,
    undo,
    unpick,
  };
}
