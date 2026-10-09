'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useOrderPickTasks } from '@/hooks/fulfillment/useSubstitution';
import {
  addDeskSerial,
  deskOrderFromQueueRow,
  removeOrderSerials,
  resolveDeskScanType,
  scanDeskOrder,
  scanDeskSku,
  scanDeskTracking,
} from '@/lib/picking/desk-scan-client';
import { unshippedOrderRowQuery } from '@/lib/queries/dashboard-queries';
import type { PickTaskRow } from '@/lib/picking/sessions';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { playScanTone, vibrateScan, type ScanFeedbackKind } from '@/lib/scan-feedback/play';
import { resolvePhoneScanIntent } from '@/lib/scan/phone-scan-intent';
import type { ScanInputSource } from '@/lib/scan/mobile-arrival-door';
import { expandSerialTail } from '@/lib/copy-chip-format';

export interface PickOrderMessage {
  tone: 'error' | 'warning' | 'success' | 'info';
  text: string;
}

/** The order-level pick fact the card shows; null = not picked. */
export interface PickOrderPicked {
  /** Who picked — the staff bubble's colour and initial. */
  byId: number | null;
  byName: string | null;
  at: string | null;
}

/** One serial row on the card: an allocated unit still to pick, or a serial on the scan session. */
export interface PickOrderSerialRow {
  serial: string;
  state: 'to-pick' | 'picked' | 'scanned';
  bin: string | null;
  /** The serial is saved on the order — it can be corrected or removed in place. */
  editable: boolean;
}

/** The serial the camera just added — held on screen until Add more or Done. */
export interface PickSerialAdded {
  serial: string;
  /** Serials on the order now, against its `quantity`. */
  count: number;
  quantity: number;
  /** Every unit has its serial and nothing warned: Done moves the walk on. */
  complete: boolean;
}

/** The scan's tone + buzz — the pick screen's, shared with pairing a bin. */
export function feedback(kind: ScanFeedbackKind): void {
  playScanTone(kind);
  vibrateScan(kind);
}

/**
 * The order is in hand: a serial for every unit (the desk's own "complete",
 * `resolveDeskScanType`), or its SKU code scanned — a SKU scan takes the
 * order's units off stock in one go.
 */
function orderInHand(order: ActiveStationOrder): boolean {
  return order.serialNumbers.length >= Math.max(1, Number(order.quantity) || 1) || (order.scannedSkuCodes?.length ?? 0) > 0;
}

/**
 * The phone's order pick — the Picker desk's scan flow on one order of the
 * `/m/pick` walk (owner 2026-09-28: a phone picks the same way as desktop).
 * Serial / SKU against the card; a printed label still opens its order;
 * Undo last step. Every write goes through `desk-scan-client`,
 * the same module the desk controller calls.
 *
 * `orderId` opens that order's card read-only — a PREVIEW, no desk anchor
 * yet. The first serial / SKU scan anchors the pick on the ORDER
 * (`scanDeskOrder`: pickup orders have no label), then lands on that anchor.
 *
 * `onPicked` fires once the order is done for this walk: its units are all
 * scanned here, or another device picked it while it sat unscanned here.
 */
export function usePickOrder({ orderId: openOrderId, onPicked }: { orderId: number; onPicked?: () => void }) {
  const { user, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const [card, setCard] = useState<ActiveStationOrder | null>(null);
  const [picked, setPicked] = useState<PickOrderPicked | null>(null);
  /** The card is the walk's order read from the queue — no desk anchor to scan against yet. */
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PickOrderMessage | null>(null);
  /**
   * The serial just added — the camera holds on it (owner 2026-10-08: it stays on screen until the picker
   * chooses Add more or Done), so several serials go in one after another without the walk moving on.
   */
  const [added, setAdded] = useState<PickSerialAdded | null>(null);
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

  // Walk callbacks read the latest render, never a stale closure.
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;
  const scanningRef = useRef(false);

  // The same realtime event the desk tables patch from: `order.picked` —
  // `picked: false` when a reversal takes the order back out of the lane.
  const ordersChannel = safeChannelName(() => getOrdersChannelName(user!.organizationId));
  useAblyChannel(
    ordersChannel,
    'order.picked',
    (msg: { data?: { orderId?: unknown; picked?: boolean; pickedBy?: number | null; pickedByName?: string | null; pickedAt?: string | null } }) => {
      const data = msg?.data;
      if (!orderId || Number(data?.orderId) !== orderId) return;
      // A forward pick omits `picked`; a reversal carries the stage-facts truth.
      setPicked((prev) =>
        data?.picked === false
          ? null
          : {
              byId: data?.pickedBy ?? prev?.byId ?? null,
              byName: data?.pickedByName ?? prev?.byName ?? null,
              at: data?.pickedAt ?? prev?.at ?? null,
            },
      );
      if (data?.picked === false && picked) {
        setMessage({ tone: 'info', text: `${card?.orderId ?? 'This order'} was unpicked — scan a serial or SKU to re-pick` });
      }
      // Picked on another device while it sat unscanned here: the walk moves on.
      if (data?.picked !== false && preview && !picked && !scanningRef.current) onPickedRef.current?.();
      void queryClient.invalidateQueries({ queryKey: ['order-pick-tasks', orderId] });
    },
    !!ordersChannel && orderId != null,
  );

  const loadCard = useCallback(
    (next: ActiveStationOrder | null) => {
      if (!next || next.id !== card?.id) setExpected(new Map());
      // A desk reply knows only its own scan session's serials; the order keeps every serial saved on
      // it (earlier visits, other devices) — so the same order's card is a union, never a replacement.
      setCard((prev) => {
        if (!next || !prev || next.id !== prev.id) return next;
        const seen = new Set(next.serialNumbers.map((s) => s.toUpperCase()));
        const kept = prev.serialNumbers.filter((s) => !seen.has(s.toUpperCase()));
        return kept.length ? { ...next, serialNumbers: [...kept, ...next.serialNumbers] } : next;
      });
      setPreview(false);
    },
    [card?.id],
  );

  // The walk's order, read once per id from the desk's own row-by-id query.
  const tapped = useQuery(unshippedOrderRowQuery({ orderId: openOrderId }));
  const seededFor = useRef<number | null>(null);
  useEffect(() => {
    if (seededFor.current === openOrderId || !tapped.isSuccess) return;
    seededFor.current = openOrderId;
    const row = tapped.data;
    if (!row) {
      setMessage({ tone: 'error', text: 'That order is no longer in the queue' });
      return;
    }
    setExpected(new Map());
    setCard(deskOrderFromQueueRow(row));
    setPreview(true);
    setPicked(row.picked_at ? { byId: Number(row.picked_by) || null, byName: row.picked_by_name ?? null, at: row.picked_at } : null);
    setMessage(null);
  }, [openOrderId, tapped.isSuccess, tapped.data]);

  const run = useCallback(
    async (value: string) => {
      // The walk's order with no live scan anchor — opened unscanned, or its
      // pick reversed (here or on another device): a serial / SKU scan picks
      // it first, anchored on the ORDER, then lands on that anchor.
      const unanchored = card != null && (preview || (!picked && card.orderFound !== false));
      let context = card && !unanchored ? card : null;
      let type = card ? resolveDeskScanType(value, card) : 'TRACKING';
      const idempotencyKey = safeRandomUUID();
      const correlation = await resolvePhoneScanIntent(value, idempotencyKey);

      if (unanchored && card && (type === 'SERIAL' || type === 'SKU')) {
        const anchor = await scanDeskOrder(card.id ?? openOrderId, {
          idempotencyKey: safeRandomUUID(),
          correlation,
        });
        if (!anchor.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: anchor.error });
          return;
        }
        loadCard(anchor.order);
        setPicked({ byId: user?.staffId ?? null, byName: user?.name ?? null, at: new Date().toISOString() });
        context = anchor.order;
      } else if (!context) {
        type = 'TRACKING';
      }

      if (type === 'TRACKING') {
        const result = await scanDeskTracking(value, { idempotencyKey, correlation });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        loadCard(result.order);
        if (result.data.orderFound) {
          setPicked({ byId: user?.staffId ?? null, byName: user?.name ?? null, at: new Date().toISOString() });
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
          contextOrder: context,
          scanSessionId: context?.scanSessionId ?? null,
          idempotencyKey,
          correlation,
        });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        if (result.order) loadCard(result.order);
        feedback(result.pickWarning ? 'warn' : 'success');
        // The added panel is the confirmation; the alert carries only a warning.
        setMessage(result.pickWarning ? { tone: 'warning', text: `${result.message} · ${result.pickWarning}` } : null);
        // The reply holds only this scan session's serials; the order counts every serial saved on it.
        const onOrder = new Set([...(card?.serialNumbers ?? []), ...(result.order?.serialNumbers ?? [])].map((s) => s.toUpperCase()));
        const quantity = Math.max(1, Number(result.order?.quantity ?? context?.quantity) || 1);
        setAdded({
          serial: result.serial,
          count: onOrder.size,
          quantity,
          // Done moves the walk on only when every unit has its serial and nothing needs a look.
          complete: Boolean(result.order && !result.pickWarning && onOrder.size >= quantity),
        });
        return;
      }

      if (type === 'SKU') {
        const result = await scanDeskSku({
          input: value,
          contextOrder: context,
          scanSessionId: context?.scanSessionId ?? null,
          idempotencyKey,
          correlation,
        });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return;
        }
        loadCard(result.order);
        feedback('success');
        setMessage({ tone: 'success', text: result.notes ? `${result.message} · ${result.notes}` : result.message });
        if (orderInHand(result.order)) onPickedRef.current?.();
        return;
      }

      feedback('reject');
      setMessage({ tone: 'error', text: `"${value}" is not a label, serial or SKU code` });
    },
    [card, preview, picked, loadCard, user?.name],
  );

  const handleScan = useCallback(
    (raw: string, source?: ScanInputSource) => {
      const trimmed = raw.trim();
      if (!trimmed || busy) return;
      // Typed by hand, the last 8 of an allocated serial names its unit (camera reads stay verbatim:
      // a short SKU code must never be mistaken for a serial tail).
      const value = source === 'typed'
        ? expandSerialTail(trimmed, (openTasks ?? []).map((t) => t.serialNumber ?? ''))
        : trimmed;
      setBusy(true);
      scanningRef.current = true;
      void run(value).finally(() => {
        scanningRef.current = false;
        setBusy(false);
        refreshTasks();
      });
    },
    [busy, run, refreshTasks, openTasks],
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

  /** Drop serials off the ORDER, whichever visit added them; their picked units go back to ALLOCATED. */
  const removeSerials = useCallback(
    async (serials: readonly string[]): Promise<boolean> => {
      if (!card?.id || busy) return false;
      setBusy(true);
      try {
        const result = await removeOrderSerials(card.id, serials);
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: result.error });
          return false;
        }
        // The order-wide answer is the truth: set, never union.
        setCard((prev) => (prev && prev.id === card.id ? { ...prev, serialNumbers: result.serialNumbers } : prev));
        feedback('success');
        const units = result.unpickedUnits;
        setMessage({ tone: 'info', text: `Removed ${serials.join(', ')}${units > 0 ? ` · ${units} unit${units === 1 ? '' : 's'} back to allocated` : ''}` });
        return true;
      } finally {
        setBusy(false);
        refreshTasks();
      }
    },
    [card?.id, busy, refreshTasks],
  );

  /** Correct a mistyped / misread serial: drop it off the order, then add the right one (which picks its unit). */
  const replaceSerial = useCallback(
    async (from: string, to: string): Promise<boolean> => {
      const next = to.trim();
      if (!card?.id || busy || !next) return false;
      if (next.toUpperCase() === from.toUpperCase()) return true;
      setBusy(true);
      try {
        const removed = await removeOrderSerials(card.id, [from]);
        if (!removed.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: removed.error });
          return false;
        }
        const kept = { ...card, serialNumbers: removed.serialNumbers };
        setCard(kept);
        // An order opened unscanned has no desk anchor yet: anchor it on the ORDER first, as a scan does.
        let context = kept;
        if (!kept.salId) {
          const anchor = await scanDeskOrder(kept.id ?? openOrderId, { idempotencyKey: safeRandomUUID() });
          if (!anchor.ok) {
            feedback('reject');
            setMessage({ tone: 'error', text: `Removed ${from}, but ${next} was not added: ${anchor.error}` });
            return false;
          }
          context = { ...anchor.order, serialNumbers: removed.serialNumbers };
          setCard(context);
          setPreview(false);
          setPicked({ byId: user?.staffId ?? null, byName: user?.name ?? null, at: new Date().toISOString() });
        }
        const result = await addDeskSerial({
          input: next,
          contextOrder: context,
          scanSessionId: context.scanSessionId ?? null,
          idempotencyKey: safeRandomUUID(),
        });
        if (!result.ok) {
          feedback('reject');
          setMessage({ tone: 'error', text: `Removed ${from}, but ${next} was not added: ${result.error}` });
          return false;
        }
        if (result.order) loadCard(result.order);
        feedback(result.pickWarning ? 'warn' : 'success');
        setMessage(
          result.pickWarning
            ? { tone: 'warning', text: `${from} → ${result.serial} · ${result.pickWarning}` }
            : { tone: 'success', text: `${from} → ${result.serial}` },
        );
        return true;
      } finally {
        setBusy(false);
        refreshTasks();
      }
    },
    [card, busy, openOrderId, loadCard, refreshTasks, user?.staffId, user?.name],
  );

  const openSerials = new Set((openTasks ?? []).map((t) => t.serialNumber?.toUpperCase()).filter(Boolean));
  const scanned = new Set((card?.serialNumbers ?? []).map((s) => s.toUpperCase()));
  // Every serial saved on the order can be corrected or removed — the order-scoped writer needs no anchor.
  const canEdit = card?.id != null;
  const serialRows: PickOrderSerialRow[] = [
    ...[...expected.values()].map((t) => {
      const serial = t.serialNumber!.toUpperCase();
      return {
        serial,
        bin: t.bin,
        state: openSerials.has(serial) ? ('to-pick' as const) : ('picked' as const),
        editable: canEdit && scanned.has(serial),
      };
    }),
    ...[...scanned]
      .filter((s) => !expected.has(s))
      .map((serial) => ({ serial, bin: null, state: 'scanned' as const, editable: canEdit })),
  ];

  return {
    isLoaded,
    signedIn: !!user,
    card,
    picked,
    /** The card has a live scan anchor — serials, SKU codes and Undo act on it. */
    live: card != null && !preview && (picked != null || card.orderFound === false),
    /** The walk's order, not yet scanned: the first serial / SKU scan picks it. */
    preview,
    busy,
    message,
    dismissMessage: () => setMessage(null),
    added,
    /** Add more: back to the lens for the next serial. */
    addMore: () => setAdded(null),
    /** Done: the camera goes away; a complete order moves the walk on. */
    finishAdded: () => {
      const complete = added?.complete ?? false;
      setAdded(null);
      if (complete) onPickedRef.current?.();
    },
    serialRows,
    tasksLoading: tasksQuery.isPending && orderId != null,
    handleScan,
    removeSerials,
    replaceSerial,
  };
}
