'use client';

/**
 * Scan-out station controller — the SHIP_CONFIRM scan loop shared by the dock
 * Station body and any compact bar.
 *
 * ## Async / non-blocking (operator 2026-08-31)
 *
 * The gun must never wait on a prior POST. Each submit clears the input,
 * refocuses, fires `POST /api/shipped/scan-out` in flight, and accepts the next
 * wedge immediately. Concurrent confirms are fine — each shipment is
 * idempotent server-side. The "active" carton follows the latest settled
 * response (or an optimistic pending chip for the most recent fire).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { setScanSubject } from '@/lib/stations/scan-subject-store';
import {
  SCAN_OUT_ACTIVE_EVENT,
  dispatchScanOutActive,
  dispatchScanOutConfirmed,
  resultToScanOutPane,
  type ScanOutActivePane,
  type ScanOutFocusStatus,
} from '@/components/outbound/scan-out/scan-out-active';

export interface ScanOutResult {
  ok: boolean;
  matched: boolean;
  duplicate?: boolean;
  /** Order is in a state that must never leave (`canceled` / `cancelled`). */
  blocked?: boolean;
  blockReason?: string | null;
  orderStatus?: string | null;
  shipConfirmedAt?: string | null;
  alreadyDelivered?: boolean;
  shipmentId?: number;
  tracking?: string | null;
  receivingId?: number | null;
  orderRowId?: number | null;
  orderId?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
  quantity?: number | null;
  accountSource?: string | null;
  imageUrl?: string | null;
  message?: string | null;
}

export type ScanOutStatus = ScanOutFocusStatus;

/** The single active-package result — replaces on each scan (Station contract). */
export interface ActiveScanOut {
  status: ScanOutStatus;
  result: ScanOutResult | null;
  /** Human-readable one-liner for compact readouts. */
  text: string;
  /** Raw scanned value that produced this result. */
  scanned: string;
}

function statusText(status: ScanOutStatus, result: ScanOutResult | null): string {
  if (status === 'pending') return 'Scanning…';
  if (status === 'blk') return result?.message || 'Do not ship';
  if (status === 'miss') return result?.message || 'No shipment found for that label';
  if (status === 'exc') return 'Delivered already';
  if (status === 'dup') return 'Already scanned out';
  if (status === 'err') return 'Scan-out failed — try again';
  if (status === 'ok' && result?.productTitle) return result.productTitle;
  return 'Shipped out';
}

async function postScanOut(tracking: string): Promise<ScanOutResult> {
  const res = await fetch('/api/shipped/scan-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingNumber: tracking }),
  });
  if (!res.ok) throw new Error(`scan-out failed (${res.status})`);
  return res.json();
}

/**
 * Presentation stays in the view. This hook owns scan value + focus, concurrent
 * POST fire-and-forget, the single active result, and the undoable handle.
 */
export function useScanOutStation() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ActiveScanOut | null>(null);
  const [undoable, setUndoable] = useState<{ shipmentId: number } | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const [isUndoing, setIsUndoing] = useState(false);
  /**
   * Last matched `orders.id` for notes — survives idle / pending / miss so the
   * single OmnichannelComposerDock can note the prior package without a second
   * mouth or a focused-pane gate.
   */
  const [noteOrderRowId, setNoteOrderRowId] = useState<number | null>(null);
  /** Composer dock focus — HID / post-scan refocus lands here (textarea). */
  const focusFnRef = useRef<(() => void) | null>(null);
  /** Monotonic token so a slower older response cannot overwrite a newer one. */
  const seqRef = useRef(0);
  /** Last matched carton — a miss must not wipe a prior good focus. */
  const lastGoodRef = useRef<ScanOutActivePane | null>(null);

  const bindFocus = useCallback((fn: (() => void) | null) => {
    focusFnRef.current = fn;
  }, []);

  const refocus = useCallback(() => {
    requestAnimationFrame(() => focusFnRef.current?.());
  }, []);

  const bustCaches = useCallback(() => {
    bustScanOutCaches(queryClient);
  }, [queryClient]);

  // External clear (identity ◁) drops undo + note target.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<ScanOutActivePane | null>).detail == null) {
        setUndoable(null);
        lastGoodRef.current = null;
        setNoteOrderRowId(null);
      }
    };
    window.addEventListener(SCAN_OUT_ACTIVE_EVENT, handler);
    return () => window.removeEventListener(SCAN_OUT_ACTIVE_EVENT, handler);
  }, []);

  const applySettled = useCallback(
    (seq: number, scanned: string, result: ScanOutResult) => {
      // Stale response — still bust caches / rail, but do not steal the focus
      // carton from a newer scan.
      const isLatest = seq === seqRef.current;

      let status: ScanOutStatus;
      if (!result.matched) status = 'miss';
      else if (result.blocked) status = 'blk';
      else if (result.alreadyDelivered) status = 'exc';
      else if (result.duplicate) status = 'dup';
      else status = 'ok';

      const pane = resultToScanOutPane(result, status, scanned);

      if (isLatest) {
        setActive({
          status,
          result,
          text: statusText(status, result),
          scanned,
        });
        if (status === 'ok' && result.shipmentId) {
          setUndoable({ shipmentId: result.shipmentId });
        } else if (status !== 'ok') {
          setUndoable(null);
        }
        if (status === 'ok' || status === 'dup' || status === 'exc' || status === 'blk') {
          lastGoodRef.current = pane;
          if (pane.orderRowId != null && pane.orderRowId > 0) {
            setNoteOrderRowId(pane.orderRowId);
            setScanSubject('order', String(pane.orderRowId));
          }
          dispatchScanOutActive(pane);
        } else if (status === 'miss' || status === 'err') {
          // Keep the prior good carton on screen; feedback still shows the miss.
          dispatchScanOutActive(lastGoodRef.current);
        }
      }

      if (status === 'ok' || status === 'dup') {
        dispatchScanOutConfirmed(pane);
        bustCaches();
      }
    },
    [bustCaches],
  );

  const submitRaw = useCallback(
    (raw: string) => {
      const v = raw.trim();
      if (!v) return;

      // Refocus BEFORE the network — the next wedge must land now.
      // Caller clears the composer draft; HID sink never fills the textarea.
      refocus();

      const seq = ++seqRef.current;
      setInFlight((n) => n + 1);
      setUndoable(null);
      setActive({
        status: 'pending',
        result: null,
        text: 'Scanning…',
        scanned: v,
      });
      // Keep the most-recent carton on the station header. Composer feedback
      // owns "Scanning…" — never replace CartonContextCard with a pending stub
      // when a prior confirm is already on screen (scan-station contract).
      if (!lastGoodRef.current) {
        dispatchScanOutActive(
          resultToScanOutPane({ tracking: v, productTitle: 'Scanning…' }, 'pending', v),
        );
      }

      void postScanOut(v)
        .then((result) => applySettled(seq, v, result))
        .catch(() => {
          if (seq !== seqRef.current) return;
          setActive({
            status: 'err',
            result: null,
            text: 'Scan-out failed — try again',
            scanned: v,
          });
          setUndoable(null);
          dispatchScanOutActive(lastGoodRef.current);
        })
        .finally(() => {
          setInFlight((n) => Math.max(0, n - 1));
          refocus();
        });
    },
    [applySettled, refocus],
  );

  const undo = useCallback(() => {
    if (!undoable || isUndoing) return;
    const { shipmentId } = undoable;
    setIsUndoing(true);
    void fetch('/api/shipped/scan-out', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`undo failed (${res.status})`);
        setUndoable(null);
        setActive(null);
        setNoteOrderRowId(null);
        dispatchScanOutActive(null);
        bustCaches();
        refocus();
      })
      .catch(() => {
        setActive({
          status: 'err',
          result: null,
          text: 'Undo failed — try again',
          scanned: '',
        });
      })
      .finally(() => {
        setIsUndoing(false);
      });
  }, [undoable, isUndoing, bustCaches, refocus]);

  return {
    bindFocus,
    refocus,
    active,
    undoable,
    /** Last matched order for notes — even when the center is idle / pending. */
    noteOrderRowId,
    submitRaw,
    undo,
    /** True while ANY confirm is in flight — never gates the gun. */
    isScanning: inFlight > 0,
    inFlight,
    isUndoing,
  };
}

/** Subscribe to the focused carton from any scan-out tree. */
export function useScanOutActivePane(): ScanOutActivePane | null {
  const [pane, setPane] = useState<ScanOutActivePane | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      setPane((e as CustomEvent<ScanOutActivePane | null>).detail ?? null);
    };
    window.addEventListener(SCAN_OUT_ACTIVE_EVENT, handler);
    return () => window.removeEventListener(SCAN_OUT_ACTIVE_EVENT, handler);
  }, []);
  return pane;
}
