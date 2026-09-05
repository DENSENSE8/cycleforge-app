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
  /** The order is in a state that must never leave (see BLOCKED_ORDER_STATUSES). */
  blocked?: boolean;
  blockReason?: string | null;
  /** `orders.status` at commit time — the reason a block happened. */
  orderStatus?: string | null;
  /**
   * On a `duplicate`, when the package actually left ('YYYY-MM-DD HH24:MI:SS').
   * The re-scan is now; the departure was whenever the first scan was.
   */
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
  /** Catalog photo for the unit, when `sku_catalog` has one. */
  imageUrl?: string | null;
  message?: string | null;
}

export type ScanOutStatus = ScanOutFocusStatus;

/**
 * Every settled scan, handed to {@link ScanOutStationOptions.onSettled} in
 * ARRIVAL order — including a response that lost the race for `active`, and
 * including a network failure.
 *
 * `active` deliberately holds only the LATEST settle (a slower older response
 * must never overwrite a newer carton on the station header). A running tape —
 * the phone's scan list — needs the opposite: with a fast gun several confirms
 * are in flight at once, so a tape derived from `active` silently drops every
 * scan that was overtaken before React rendered it.
 */
export interface SettledScanOut {
  status: ScanOutStatus;
  /**
   * True when the request never reached the server (offline, DNS, 5xx).
   *
   * Load-bearing: without it, a network failure and a label the server could not
   * resolve arrive as the same `err`/`miss`-shaped settle, and the row blames the
   * label for a problem with the dock's wifi. A caller queues on this, and only
   * on this.
   */
  transportFailed?: boolean;
  result: ScanOutResult | null;
  /** Human-readable one-liner, same wording `active.text` would carry. */
  text: string;
  /** Raw scanned value that produced this settle. */
  scanned: string;
  /** Submit order, monotonic per hook instance. Stable key for a tape row. */
  seq: number;
}

export interface ScanOutStationOptions {
  /** Called once per settled scan — see {@link SettledScanOut}. */
  onSettled?: (settled: SettledScanOut) => void;
}

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
export function useScanOutStation(options: ScanOutStationOptions = {}) {
  const queryClient = useQueryClient();
  // Kept in a ref so a call site can pass an inline closure without re-creating
  // `applySettled` / `submitRaw` on every render.
  const onSettledRef = useRef(options.onSettled);
  onSettledRef.current = options.onSettled;
  const [active, setActive] = useState<ActiveScanOut | null>(null);
  const [undoable, setUndoable] = useState<{ shipmentId: number } | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const [isUndoing, setIsUndoing] = useState(false);
  /** Which shipment {@link useScanOutStation.undoShipment} is currently undoing. */
  const [undoingShipmentId, setUndoingShipmentId] = useState<number | null>(null);
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

      const pane = resultToScanOutPane(
        result,
        status === 'blk' ? 'err' : status,
        scanned,
      );
      const text = statusText(status, result);

      // Tape first, and unconditionally: an overtaken response is still a
      // package that left the building.
      onSettledRef.current?.({ status, result, text, scanned, seq, transportFailed: false });

      if (isLatest) {
        setActive({ status, result, text, scanned });
        if (status === 'ok' && result.shipmentId) {
          setUndoable({ shipmentId: result.shipmentId });
        } else if (status !== 'ok') {
          setUndoable(null);
        }
        if (status === 'ok' || status === 'dup' || status === 'exc' || status === 'blk') {
          lastGoodRef.current = pane;
          if (pane.orderRowId != null && pane.orderRowId > 0) {
            setNoteOrderRowId(pane.orderRowId);
          }
          dispatchScanOutActive(pane);
        } else if (status === 'miss') {
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
          const text = 'No connection — queued to send';
          onSettledRef.current?.({
            status: 'err',
            result: null,
            text,
            scanned: v,
            seq,
            transportFailed: true,
          });
          if (seq !== seqRef.current) return;
          setActive({ status: 'err', result: null, text, scanned: v });
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

  /**
   * Undo a SPECIFIC shipment's scan-out, by id.
   *
   * `undo` (below) can only ever reach the LAST confirm, and `submitRaw` clears
   * that handle before the next POST — so at dock cadence the handle is gone
   * before the operator notices the mistake. The real error (wrong box, label
   * still on the bench) surfaces two or three packages later, which is exactly
   * when the single-handle undo has already been destroyed. This takes an id so
   * a surface holding a history of confirms can undo any of them.
   *
   * Resolves true when the SHIP_CONFIRM was actually deleted, so the caller can
   * drop the row rather than optimistically assuming it went.
   */
  const undoShipment = useCallback(
    async (shipmentId: number): Promise<boolean> => {
      if (!Number.isFinite(shipmentId) || shipmentId <= 0) return false;
      setUndoingShipmentId(shipmentId);
      try {
        const res = await fetch('/api/shipped/scan-out', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shipmentId }),
        });
        if (!res.ok) return false;
        // Undoing the carton the station is currently focused on has to clear
        // that focus too, or the header keeps showing a package that is no
        // longer out.
        setUndoable((prev) => (prev?.shipmentId === shipmentId ? null : prev));
        if (lastGoodRef.current?.shipmentId === shipmentId) {
          lastGoodRef.current = null;
          dispatchScanOutActive(null);
        }
        bustCaches();
        return true;
      } catch {
        return false;
      } finally {
        setUndoingShipmentId(null);
      }
    },
    [bustCaches],
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
    undoShipment,
    undoingShipmentId,
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
