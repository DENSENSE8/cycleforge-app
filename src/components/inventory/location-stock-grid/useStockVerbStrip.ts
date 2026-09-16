'use client';

/**
 * Inventory › Stock — the action strip's STATE and its three commits.
 *
 * Split from {@link StockActionBar} so the component is paint, portal and key
 * bindings while this owns what a press actually does: which view is open,
 * the drafts, the in-flight guard, and the write loop over the selection's
 * writable rows.
 *
 * ## What a press writes
 *
 * Request shapes live in `stock-bin-verb-writes.ts` — one builder per verb,
 * each naming an endpoint the phone and the scan gun already call. Nothing
 * here invents a write, and the precondition for every one of them is
 * {@link planStockBinWrites}: only `bin_contents` rows are reachable, so a
 * mixed selection writes the bin half and names the remainder.
 *
 * ## Why the commit is not optimistic
 *
 * The desk's rows come from an RSC loader (`getStockByLocation`), so the
 * refresh after a landed write IS the new truth — there is no client cache to
 * patch, and an optimistic row would be a second copy of the feed racing the
 * server's. `onCommitted` is the desk's `router.refresh()`.
 *
 * `busy` is the double-press guard and the drafts reset on success, so an
 * identical press cannot be repeated by accident. The per-request
 * `Idempotency-Key` is what stops a network RETRY of one press landing twice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReasonCode } from '@/components/sku/ReasonCodePicker';
import { toast } from '@/lib/toast';
import {
  planStockBinWrites,
  type StockBinWritePlan,
  type StockBinWriteTarget,
} from '@/lib/inventory/stock-bin-writes';
import {
  commitStockRequest,
  commitStockWrites,
  stockAdjustRequest,
  stockDeleteRequest,
  stockMoveRequest,
  stockPairProvisionalRequest,
  stockSwapRequest,
  type StockAdjustDirection,
  type StockBinRequest,
} from '@/lib/inventory/stock-bin-verb-writes';
import {
  planStockSkuReplacement,
  stockReplacementTargetRefusal,
  type StockSkuReplacementPlan,
} from '@/lib/inventory/stock-sku-replacement';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';

/** Which row the strip is: the verbs, or one verb's own inputs. */
export type StockStripView = 'actions' | 'adjust' | 'move' | 'replace';

export interface StockVerbStrip {
  view: StockStripView;
  plan: StockBinWritePlan;
  /** The rows a press will write. */
  targets: readonly StockBinWriteTarget[];
  /** The single writable row, when there is exactly one — the only honest projection. */
  single: StockBinWriteTarget | null;
  /** False ⇒ every verb is disabled and `plan.note` is the reason. */
  writable: boolean;
  busy: boolean;
  error: string | null;
  deleteArmed: boolean;

  direction: StockAdjustDirection;
  setDirection: (next: StockAdjustDirection) => void;
  qtyDraft: string;
  setQtyDraft: (next: string) => void;
  /** The parsed positive integer, or 0 when the draft is empty / invalid. */
  qty: number;
  reason: ReasonCode | null;
  setReason: (next: ReasonCode | null) => void;
  note: string;
  setNote: (next: string) => void;
  destination: string | null;
  setDestination: (next: string | null) => void;
  /** `null` ⇒ move the whole count on every picked row. */
  moveQty: number | null;

  /**
   * What replacing the SKU would DO to this selection — `pair` (fold a
   * `TMP-…` placeholder into the real product, warehouse-wide) or `swap`
   * (this bin only). See {@link planStockSkuReplacement}.
   */
  replacement: StockSkuReplacementPlan;
  /** The picked target SKU, or `null`. */
  targetSku: string | null;
  setTargetSku: (next: string | null) => void;
  /** The target's product name, for the row's face after picking. */
  targetTitle: string | null;
  setTargetTitle: (next: string | null) => void;
  /** A refused target (same SKU, another placeholder), or `null`. */
  targetRefusal: string | null;

  adjustReady: boolean;
  moveReady: boolean;
  replaceReady: boolean;

  openAdjust: () => void;
  openMove: () => void;
  openReplace: () => void;
  backToActions: () => void;
  runAdjust: () => void;
  runMove: () => void;
  /** Pair or swap, whichever the ROWS are in — never the route's choice. */
  runReplace: () => void;
  runDelete: () => void;
}

export function useStockVerbStrip({
  rows,
  staffId,
  onClear,
  onCommitted,
}: {
  rows: readonly LocationStockTableRow[];
  /** The acting staffer, or `undefined` for a session with none. */
  staffId?: number;
  onClear: () => void;
  onCommitted: () => void;
}): StockVerbStrip {
  const [view, setView] = useState<StockStripView>('actions');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [direction, setDirection] = useState<StockAdjustDirection>('in');
  const [qtyDraft, setQtyDraft] = useState('');
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [destination, setDestination] = useState<string | null>(null);
  const [targetSku, setTargetSku] = useState<string | null>(null);
  const [targetTitle, setTargetTitle] = useState<string | null>(null);

  const plan = useMemo(() => planStockBinWrites(rows), [rows]);
  const targets = plan.targets;
  const writable = targets.length > 0;
  const single = targets.length === 1 ? targets[0] : null;

  /** The replacement's DIRECTION comes from the rows, never from the press. */
  const replacement = useMemo(() => planStockSkuReplacement(rows), [rows]);
  const targetRefusal = useMemo(
    () =>
      replacement.sourceSku && targetSku
        ? stockReplacementTargetRefusal(replacement.sourceSku, targetSku)
        : null,
    [replacement.sourceSku, targetSku],
  );

  const qty = useMemo(() => {
    const parsed = parseInt(qtyDraft, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [qtyDraft]);

  /** A changed selection disarms delete: the second press must be deliberate. */
  useEffect(() => {
    setDeleteArmed(false);
    setError(null);
  }, [rows]);

  const backToActions = useCallback(() => {
    setView('actions');
    setError(null);
    setQtyDraft('');
    setNote('');
    setDestination(null);
    setTargetSku(null);
    setTargetTitle(null);
  }, []);

  const openAdjust = useCallback(() => {
    setDeleteArmed(false);
    setError(null);
    setView('adjust');
  }, []);

  const openMove = useCallback(() => {
    setDeleteArmed(false);
    setError(null);
    setView('move');
  }, []);

  const openReplace = useCallback(() => {
    setDeleteArmed(false);
    setError(null);
    setView('replace');
  }, []);

  /**
   * One write per target. A partial failure keeps the strip open with the first
   * real reason — the rows that landed are already visible behind it once the
   * refresh settles, so re-stating them in the strip would be a second, staler
   * report of the same fact.
   */
  const commit = useCallback(
    async (
      label: (ok: number) => string,
      request: (target: StockBinWriteTarget) => StockBinRequest,
      after: () => void,
    ) => {
      if (busy || !writable) return;
      setBusy(true);
      setError(null);
      const { ok, failed, reason: failure } = await commitStockWrites(targets, request);
      setBusy(false);
      if (ok > 0) {
        toast.success(label(ok));
        onCommitted();
      }
      if (failed > 0) {
        setError(failure ?? `${failed} of ${targets.length} rows could not be written`);
        return;
      }
      after();
    },
    [busy, onCommitted, targets, writable],
  );

  const adjustReady =
    writable && qty > 0 && reason != null && (!reason.requires_note || note.trim().length > 0);

  const runAdjust = useCallback(() => {
    if (!adjustReady) return;
    void commit(
      (ok) =>
        `${direction === 'in' ? 'Added' : 'Removed'} ${qty} on ${ok === 1 ? '1 row' : `${ok} rows`}`,
      (target) =>
        stockAdjustRequest(target, {
          direction,
          qty,
          staffId,
          reasonCode: reason?.code,
          reasonCodeId: reason?.id,
          notes: note.trim() || undefined,
        }),
      () => {
        setQtyDraft('');
        setNote('');
      },
    );
  }, [adjustReady, commit, direction, note, qty, reason, staffId]);

  const moveQty = qty > 0 ? qty : null;
  /** A move onto one of the picked rows' own bins is the refusal the route makes. */
  const moveReady =
    writable && destination != null && !targets.some((t) => t.barcode === destination);

  const runMove = useCallback(() => {
    if (!moveReady || destination == null) return;
    void commit(
      (ok) => `Moved ${ok === 1 ? '1 pair' : `${ok} pairs`} to ${destination}`,
      (target) =>
        stockMoveRequest(target, {
          toBarcode: destination,
          qty: moveQty ?? undefined,
          staffId,
        }),
      () => {
        setDestination(null);
        setQtyDraft('');
        // The rows moved: whatever is ticked now names a place they left.
        onClear();
      },
    );
  }, [commit, destination, moveQty, moveReady, onClear, staffId]);

  /**
   * The ONE-request commit, for a verb whose write is not per bin.
   *
   * `commit` above fans out over the selected bins because adjust / move /
   * delete each act on a row. Pairing a placeholder acts on the SKU: one call
   * re-keys every bin it ever reached, and a second call would 404 because the
   * placeholder no longer exists. Sending it per selected row would turn a
   * successful merge into "1 of 3 rows could not be written".
   */
  const commitOnce = useCallback(
    async (label: string, request: StockBinRequest, after: () => void) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await commitStockRequest(request);
        toast.success(label);
        onCommitted();
        after();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The write did not land');
      } finally {
        setBusy(false);
      }
    },
    [busy, onCommitted],
  );

  const replaceReady =
    replacement.blocked == null && targetSku != null && targetRefusal == null;

  const runReplace = useCallback(() => {
    if (!replaceReady || targetSku == null || replacement.sourceSku == null) return;
    const targetFace = (targetTitle ?? '').trim() || targetSku;

    if (replacement.kind === 'pair') {
      void commitOnce(
        `Paired ${replacement.sourceSku} into ${targetFace}`,
        stockPairProvisionalRequest({
          provisionalSku: replacement.sourceSku,
          targetSku,
          staffId,
        }),
        () => {
          setTargetSku(null);
          setTargetTitle(null);
          // The placeholder is gone; every ticked row now belongs to a SKU
          // that did not exist when it was ticked.
          onClear();
        },
      );
      return;
    }

    void commit(
      (ok) => `Replaced the SKU in ${ok === 1 ? '1 bin' : `${ok} bins`} with ${targetFace}`,
      (target) =>
        stockSwapRequest(target, {
          newSku: targetSku,
          qty: moveQty ?? undefined,
          staffId,
        }),
      () => {
        setTargetSku(null);
        setTargetTitle(null);
        setQtyDraft('');
        // The rows carry a different SKU now — the old identity is not there
        // to act on again.
        onClear();
      },
    );
  }, [
    commit,
    commitOnce,
    moveQty,
    onClear,
    replaceReady,
    replacement.kind,
    replacement.sourceSku,
    staffId,
    targetSku,
    targetTitle,
  ]);

  const runDelete = useCallback(() => {
    if (!writable) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    void commit(
      (ok) => `Deleted ${ok === 1 ? '1 pairing' : `${ok} pairings`}`,
      (target) => stockDeleteRequest(target, { staffId }),
      onClear,
    );
  }, [commit, deleteArmed, onClear, staffId, writable]);

  return {
    view,
    plan,
    targets,
    single,
    writable,
    busy,
    error,
    deleteArmed,
    direction,
    setDirection,
    qtyDraft,
    setQtyDraft: useCallback((next: string) => {
      setQtyDraft(next);
      setError(null);
    }, []),
    qty,
    reason,
    setReason,
    note,
    setNote,
    destination,
    setDestination: useCallback((next: string | null) => {
      setDestination(next);
      setError(null);
    }, []),
    moveQty,
    replacement,
    targetSku,
    setTargetSku: useCallback((next: string | null) => {
      setTargetSku(next);
      setError(null);
    }, []),
    targetTitle,
    setTargetTitle,
    targetRefusal,
    adjustReady,
    moveReady,
    replaceReady,
    openAdjust,
    openMove,
    openReplace,
    backToActions,
    runAdjust,
    runMove,
    runReplace,
    runDelete,
  };
}
