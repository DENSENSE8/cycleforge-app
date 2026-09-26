'use client';

/**
 * Repeat-tap ±1 stock adjustment, committed as ONE write per burst.
 *
 * ## Why this exists
 *
 * `PATCH /api/locations/[barcode]` is not idempotent-per-tap: every accepted
 * call appends a `sku_stock_ledger` row AND an audit row (see the route's
 * `take` / `put` branches). A naive one-tap-one-request strip therefore turns
 * "I pulled six of these" into six ledger entries, six audit entries, six
 * idempotency keys and six offline-queue items — a floor correction that reads
 * like six separate events to anyone auditing the bin later.
 *
 * So taps accumulate into a per-SKU delta and exactly one request lands per
 * burst. The operator sees the number move immediately (the caller paints
 * `qty + pendingDelta`); the server sees one honest `put 6` / `take 6`.
 *
 * ## When the burst ends
 *
 * {@link BIN_QTY_COMMIT_IDLE_MS} of no taps, or whichever comes first of the
 * caller's own boundaries — take-reason change, keypad open, leaving the
 * location record — each of which calls {@link BinQtyCommit.flush}. Unmount flushes too: the fetch
 * outlives the component, so walking away from the phone still records what
 * the thumb already did.
 *
 * Pure client orchestration: no JSX, no layout. The strip that mounts it is
 * `LocationQtyStrip`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queueOrFetch } from '@/lib/offline/write-queue';
import { safeRandomUUID } from '@/lib/safe-uuid';

/**
 * How long after the last tap the burst commits.
 *
 * 1200ms is above a comfortable repeat-tap cadence (a counting thumb lands
 * every ~300-400ms) and below the point where the operator has moved on and
 * would be surprised to see the write land. Shorter splits one correction into
 * several ledger rows; longer holds an uncommitted number on screen while the
 * next label is already being scanned.
 */
export const BIN_QTY_COMMIT_IDLE_MS = 1200;

/**
 * Reason codes for the quick path when the caller names none: the API's own
 * defaults for a bare put/take. A take may carry the page's chosen take reason
 * (FBA · Orders · Custom…, `src/lib/inventory/take-reason.ts`) via
 * `takeReason`; a put never carries one.
 */
const QUICK_PUT_REASON = 'BIN_ADD';
const QUICK_TAKE_REASON = 'BIN_PULL';

export interface BinQtyCommitted {
  sku: string;
  /** Signed delta that was applied. */
  delta: number;
  /** Authoritative bin qty from the server, or null when queued offline. */
  binQty: number | null;
  /** True when the write was persisted to the offline queue, not the server. */
  queued: boolean;
}

export interface BinQtyFailed {
  sku: string;
  /** Signed delta that did NOT land — the caller reverts by this much. */
  delta: number;
  message: string;
}

export interface BinQtyCommit {
  /** Uncommitted signed delta per SKU. Paint `qty + pending` as the live value. */
  pending: Readonly<Record<string, number>>;
  /**
   * Add `step` to the pending delta for `sku`. `baseQty` is the committed
   * on-hand — the clamp floor, so a burst can never drive a bin negative.
   * Returns false when the tap was refused by that clamp.
   */
  bump: (sku: string, step: number, baseQty: number) => boolean;
  /** Drop the pending delta for one SKU without writing it. */
  cancel: (sku: string) => void;
  /** Commit every pending delta now. Safe to call with nothing pending. */
  flush: () => Promise<void>;
  /** True while a burst is being written. */
  busy: boolean;
}

export function useBinQtyCommit({
  binBarcode,
  staffId,
  invalidateKey,
  takeReason,
  onCommitStart,
  onCommitted,
  onFailed,
}: {
  binBarcode: string;
  staffId: number;
  /** React-query key invalidated once a burst has been written. */
  invalidateKey: readonly unknown[];
  /**
   * Why a take left the location, read when the burst commits. Callers flush
   * before changing it so one burst never straddles two reasons.
   */
  takeReason?: { reason: string; notes: string | null };
  /**
   * Fired the instant a burst leaves the pending state, BEFORE the request.
   * The caller folds the delta into its own committed quantity here so the
   * number on screen never flickers back to the pre-tap value while the
   * write is in flight. {@link onCommitted} reconciles it to the server's
   * answer; {@link onFailed} is the signal to revert by the same delta.
   */
  onCommitStart: (sku: string, delta: number) => void;
  onCommitted: (result: BinQtyCommitted) => void;
  onFailed: (failure: BinQtyFailed) => void;
}): BinQtyCommit {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  // The ref is the source of truth the timer reads; `pending` is only for
  // paint. Keeping both means a tap that lands between a render and the
  // timeout cannot be dropped by a stale closure.
  const pendingRef = useRef<Record<string, number>>({});
  const timerRef = useRef<number | null>(null);
  /**
   * The location a burst BELONGS to, captured when it opens.
   *
   * The mounted location can change while taps are still uncommitted (a
   * client navigation between two location records reuses the hook).
   * Writing those to whatever location is mounted last would move stock into
   * the wrong bin — the burst carries its own address instead.
   */
  const burstBarcodeRef = useRef(binBarcode);
  /** The location currently mounted, whatever the open burst belongs to. */
  const binBarcodeRef = useRef(binBarcode);
  const takeReasonRef = useRef(takeReason);
  useEffect(() => {
    takeReasonRef.current = takeReason;
  }, [takeReason]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(async () => {
    clearTimer();
    const entries = Object.entries(pendingRef.current).filter(([, delta]) => delta !== 0);
    if (entries.length === 0) {
      pendingRef.current = {};
      setPending({});
      return;
    }
    // Clear BEFORE awaiting: the strip goes back to a settled number straight
    // away and further taps start a fresh burst rather than double-applying
    // the one already in flight.
    pendingRef.current = {};
    setPending({});
    setBusy(true);
    try {
      for (const [sku, delta] of entries) onCommitStart(sku, delta);
      for (const [sku, delta] of entries) {
        const take = delta < 0 ? takeReasonRef.current : undefined;
        // Fresh key per burst — the server replays the cached response on
        // retry, so a flaky radio cannot double-apply this adjustment.
        const idempotencyKey = safeRandomUUID();
        try {
          const res = await queueOrFetch({
            url: `/api/locations/${encodeURIComponent(burstBarcodeRef.current)}`,
            aggregateKey: `location:${burstBarcodeRef.current}:sku:${sku}`,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
              action: delta < 0 ? 'take' : 'put',
              sku,
              qty: Math.abs(delta),
              staffId,
              reason: delta < 0 ? (take?.reason ?? QUICK_TAKE_REASON) : QUICK_PUT_REASON,
              notes: take?.notes ?? null,
              clientEventId: idempotencyKey,
            }),
          });
          const data = (await res.json().catch(() => null)) as
            | { success?: boolean; error?: string; binQty?: number; queued?: boolean }
            | null;
          if (!res.ok || data?.success === false) {
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          onCommitted({
            sku,
            delta,
            binQty: typeof data?.binQty === 'number' ? Number(data.binQty) : null,
            queued: data?.queued === true,
          });
        } catch (err) {
          onFailed({
            sku,
            delta,
            message: err instanceof Error ? err.message : 'Adjust failed',
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
    } finally {
      setBusy(false);
    }
  }, [
    clearTimer,
    invalidateKey,
    onCommitStart,
    onCommitted,
    onFailed,
    queryClient,
    staffId,
  ]);

  // The timer and unmount both need the CURRENT flush, not the one captured
  // when the effect below first ran.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const bump = useCallback(
    (sku: string, step: number, baseQty: number): boolean => {
      const next = (pendingRef.current[sku] ?? 0) + step;
      if (baseQty + next < 0) return false;
      // First tap of a burst pins the address every write in it will use.
      if (Object.keys(pendingRef.current).length === 0) {
        burstBarcodeRef.current = binBarcodeRef.current;
      }
      pendingRef.current = { ...pendingRef.current, [sku]: next };
      setPending(pendingRef.current);
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void flushRef.current();
      }, BIN_QTY_COMMIT_IDLE_MS);
      return true;
    },
    [clearTimer],
  );

  const cancel = useCallback(
    (sku: string) => {
      const next = { ...pendingRef.current };
      delete next[sku];
      pendingRef.current = next;
      setPending(next);
      if (Object.keys(next).length === 0) clearTimer();
    },
    [clearTimer],
  );

  // A new location scanned into the same sheet closes the previous burst
  // before the address changes under it.
  useEffect(() => {
    if (binBarcodeRef.current === binBarcode) return;
    void flushRef.current();
    binBarcodeRef.current = binBarcode;
  }, [binBarcode]);

  // Leaving the surface commits what the thumb already did. The request is
  // not cancelled by unmount, and `queueOrFetch` persists it when offline.
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  return { pending, bump, cancel, flush, busy };
}
