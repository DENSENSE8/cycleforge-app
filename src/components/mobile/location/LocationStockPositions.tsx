'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  ExternalLink,
  Images,
  MoreVertical,
  Package,
  ScanBarcode,
  ChevronsRight,
  SlidersHorizontal,
  Trash2,
} from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { TouchQtyStepper } from '@/design-system/components/TouchQtyStepper';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { useAuth } from '@/contexts/AuthContext';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { resolveScannedItemSku } from '@/lib/inventory/scanned-item-sku';
import { routeScan } from '@/lib/barcode-routing';
import { recordStockAdjust } from '@/lib/mobile/stock-adjust-session';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { announceStockTransfer, postStockTransfer } from '@/lib/inventory/stock-transfer-client';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { locationHubPath, locationKeypadHref } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { photoContentUrl } from '@/lib/photos/display-url';
import { uploadSkuStockShots } from '@/lib/photos/sku-stock-photo-upload';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { formatMonthDayTimePST } from '@/utils/date';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { TakeReasonChooser } from '@/components/mobile/pair/TakeReasonChooser';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { LocationQtyStrip } from '@/components/mobile/scan/LocationQtyStrip';
import { useBinQtyCommit } from '@/components/mobile/scan/use-bin-qty-commit';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationBindContent, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { SkuLinkedPhotoStrip } from '@/components/mobile/stock/SkuLinkedPhotoStrip';
import {
  MobileNativePhotoCapture,
  MobilePhotoLibraryInput,
  type CapturedShot,
} from '@/components/mobile/photos/MobileNativePhotoCapture';

/** One task at a time in ONE sheet (docs/mobile-first/V2_OBJECT_FIRST.md §5). */
type Stage = 'rest' | 'adjust' | 'move' | 'more' | 'photos';
type TitleSave = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string };
type StageVerb = 'adjust' | 'move' | 'back' | 'done' | 'count' | 'commit' | 'next';

const MORE_ROW_CLASS = 'w-full justify-start';
/** The same unit is scanned again on purpose when counting: a short same-code cooldown. */
const ITEM_SCAN_DEDUP_MS = 900;

/**
 * Stock at one location as flat rows; a tap opens the stock position bottom
 * sheet: identity → evidence → next verb (Adjust · Move); the header owns Camera
 * and the exact count. Adjust is ±1 first; the keypad lives under More.
 * Counting, moving and record management are stages of that sheet, never a
 * resting form. The sheet has no X: it dismisses by swipe or an outside tap.
 *
 * A location scan lands here: `adjustSku` opens that SKU's sheet straight on
 * adjust; `pick` heads the rows "Select item" (last moved first) and a tap goes
 * straight to adjust. A hardware scan of an item here picks it, then counts +1
 * per scan; `next` walks on to the neighbouring location and `doneReturn`
 * sends Done back to the scan loop.
 */
export function LocationStockPositions({
  record,
  returnTo,
  verificationToken,
  adjustSku = null,
  pick = false,
  next = null,
  doneReturn = null,
}: {
  record: LocationRecord;
  returnTo: string;
  verificationToken: string | null;
  /** The one SKU a location scan landed on; read on mount only. */
  adjustSku?: string | null;
  /** The scan found several items: the rows are the item picker. */
  pick?: boolean;
  /** The next location in this room's walk. */
  next?: { face: string; open: () => void } | null;
  /** Arrived from the scan loop: Done goes back to the camera. */
  doneReturn?: (() => void) | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = useMemo(() => locationRecordQueryKey(record.code), [record.code]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('rest');
  const [error, setError] = useState<string | null>(null);
  const [takeReason, setTakeReason] = useState<TakeReasonChoice>(null);
  const [moveQty, setMoveQty] = useState(1);
  const [splitting, setSplitting] = useState(false);
  const [destination, setDestination] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSave, setTitleSave] = useState<TitleSave>({ state: 'idle' });
  const [actionBusy, setActionBusy] = useState<'move' | 'delete' | 'count' | null>(null);
  /** The ±1 draft while adjusting without a location scan; null otherwise. */
  const [countDraft, setCountDraft] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  /** The house photo capture, open over the page (the sheet steps aside); `files` = picked from the library first. */
  const [capture, setCapture] = useState<{ files: File[] } | null>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const selected = record.contents.find((row) => row.sku === selectedSku) ?? null;
  const takePayload = useMemo(() => takeReasonPayload(takeReason), [takeReason]);
  const commitReason = useMemo(
    () => (takePayload.ok ? { reason: takePayload.reason, notes: takePayload.notes } : undefined),
    [takePayload],
  );

  const patchRow = useCallback(
    (sku: string, patch: (row: LocationBindContent) => LocationBindContent | null) => {
      queryClient.setQueryData<LocationRecord>(key, (previous) => previous
        ? {
            ...previous,
            contents: previous.contents.flatMap((row) => {
              if (row.sku !== sku) return [row];
              const next = patch(row);
              return next ? [next] : [];
            }),
          }
        : previous);
    },
    [key, queryClient],
  );

  const applyQty = useCallback(
    (sku: string, next: (previous: number) => number) => patchRow(sku, (row) => {
      const qty = Math.max(0, next(row.qty));
      return qty > 0 || row.isProvisional ? { ...row, qty } : null;
    }),
    [patchRow],
  );

  const quick = useBinQtyCommit({
    binBarcode: record.code,
    staffId: user?.staffId ?? 0,
    invalidateKey: key,
    locationVerificationToken: verificationToken,
    takeReason: commitReason,
    onCommitStart: useCallback((sku: string, delta: number) => applyQty(sku, (qty) => qty + delta), [applyQty]),
    onCommitted: useCallback(({ sku, delta, binQty }: { sku: string; delta: number; binQty: number | null }) => {
      if (binQty != null) applyQty(sku, () => binQty);
      // The scan page's tape, Undo and tally read this session's writes.
      const row = record.contents.find((candidate) => candidate.sku === sku);
      recordStockAdjust({
        id: safeRandomUUID(),
        code: record.code,
        face: record.face,
        sku,
        title: row?.productTitle ?? null,
        imageUrl: row?.imageUrl ?? null,
        delta,
        at: new Date().toISOString(),
        proof: verificationToken,
        undone: false,
      });
    }, [applyQty, record, verificationToken]),
    onFailed: useCallback(({ sku, delta, message }: { sku: string; delta: number; message: string }) => {
      applyQty(sku, (qty) => qty - delta);
      setError(message);
    }, [applyQty]),
  });

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [key, queryClient]);

  const open = (row: LocationBindContent) => {
    setError(null);
    setStage('rest');
    setMoveQty(Math.max(1, row.qty));
    setSplitting(false);
    setCountDraft(null);
    setDestination('');
    setTitleDraft(row.productTitle?.trim() || '');
    setTitleSave({ state: 'idle' });
    setSelectedSku(row.sku);
  };

  const startAdjust = (row: LocationBindContent) => {
    // ±1 first, on the shelf; the number between − and + opens the Take / Put keypad.
    if (!verificationToken) setCountDraft(row.qty);
    setStage('adjust');
  };

  // A one-item scan lands on that item's ±1 strip; the URL's one-shot params
  // are dropped by the hub, so this runs for the landing only, never on a refresh.
  useEffect(() => {
    const row = adjustSku ? record.contents.find((candidate) => candidate.sku === adjustSku) : null;
    if (row) {
      open(row);
      startAdjust(row);
    } else if (pick) {
      sectionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  /** A manual ±1 moves the draft count; it never goes below zero. */
  const bumpCount = (step: number) => {
    if (countDraft == null || countDraft + step < 0) {
      vibrateScan('reject');
      return false;
    }
    setCountDraft(countDraft + step);
    vibrateScan('success');
    return true;
  };

  const saveTitle = useCallback(async () => {
    if (!selected || !isProvisionalSku(selected.sku) || titleSave.state === 'saving') return;
    const productTitle = titleDraft.trim();
    if (productTitle === (selected.productTitle?.trim() || '')) return;
    if (productTitle.length < 2 || productTitle.length > 200) {
      setTitleSave({ state: 'error', message: 'Title must be 2–200 characters' });
      return;
    }
    const sku = selected.sku;
    setTitleSave({ state: 'saving' });
    try {
      const response = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productTitle }),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not save the title');
      patchRow(sku, (row) => ({ ...row, productTitle }));
      setTitleSave({ state: 'saved' });
      void refresh();
    } catch (cause) {
      setTitleSave({ state: 'error', message: cause instanceof Error ? cause.message : 'Could not save the title' });
    }
  }, [patchRow, refresh, selected, titleDraft, titleSave.state]);

  /**
   * Without a fresh location scan the shelf takes an exact count (the manual
   * count door, recorded as a count with its actor), never a put/take that
   * would claim the operator stood at this location.
   */
  const commitCount = async (row: LocationBindContent, qty: number) => {
    if (!user || actionBusy) return;
    setActionBusy('count');
    try {
      await commitStockRequest(
        stockSetRequest(
          { rowId: `${record.code}:${row.sku}`, barcode: record.code, sku: row.sku, qty: row.qty, face: `${record.face} · ${row.sku}` },
          qty,
          // Versioned: a count changed on another device since this sheet loaded is refused, not overwritten.
          { staffId: user.staffId, reason: row.qty === 0 ? 'BIN_ADD' : 'MANUAL_COUNT', expectedUpdatedAt: row.lastMoved ?? undefined },
        ),
      );
      applyQty(row.sku, () => qty);
      recordStockAdjust({
        id: safeRandomUUID(),
        code: record.code,
        face: record.face,
        sku: row.sku,
        title: row.productTitle ?? null,
        imageUrl: row.imageUrl ?? null,
        delta: qty - row.qty,
        at: new Date().toISOString(),
        // A manual count carries no scan proof: never undone from the scan page.
        proof: null,
        undone: false,
      });
      vibrateScan('success');
      setCountDraft(null);
      setStage('rest');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the count');
    } finally {
      setActionBusy(null);
    }
  };

  const close = () => {
    void quick.flush();
    // Dismissal is a save gesture for the title, never a discard. An unset
    // manual count is a draft: only its own Set verb writes it.
    void saveTitle();
    setSelectedSku(null);
    setViewerOpen(false);
  };

  const navigateAfterFlush = useCallback((href: string) => {
    void quick.flush().finally(() => router.push(href));
  }, [quick, router]);

  const bump = (row: LocationBindContent, step: number) => {
    setError(null);
    if (step < 0 && !takePayload.ok) {
      setError(takePayload.error);
      vibrateScan('reject');
      return false;
    }
    const accepted = quick.bump(row.sku, step, row.qty);
    vibrateScan(accepted ? 'success' : 'reject');
    return accepted;
  };

  /**
   * A hardware scan of an item on this record: the first scan picks it (opens
   * its adjust), each further scan of the same item counts one unit. Printed
   * location labels are the hub's (it re-verifies or walks). A value naming a
   * SKU here is always an item; anything else is claimed only while the
   * operator is picking or adjusting, so a stray tracking label on a browsed
   * record still routes as before. A bare letter-led code that turns out not
   * to be an item here goes back to the hub as a location.
   */
  const itemScanArmed = pick || stage === 'adjust';
  useEffect(() => {
    const onWedge = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string; location?: boolean }>).detail;
      const raw = detail?.value?.trim();
      if (!raw || detail?.location === true || event.defaultPrevented || record.contents.length === 0) return;
      const local = record.contents.some((row) => row.sku.toUpperCase() === raw.toUpperCase());
      const route = routeScan(raw);
      const printedLocation = route?.type === 'bin-paired-order' || (route?.type === 'bin' && Boolean(route.redirect));
      if (!local && (printedLocation || !itemScanArmed)) return;
      event.preventDefault();
      void resolveScannedItemSku(raw, record.contents.map((row) => row.sku)).then((sku) => {
        const row = sku ? record.contents.find((candidate) => candidate.sku === sku) : null;
        if (!row) {
          if (route?.type === 'bin') {
            window.dispatchEvent(new CustomEvent('wedge-scan', { detail: { value: raw, location: true }, cancelable: true }));
            return;
          }
          vibrateScan('reject');
          toast.error(`${raw} is not stocked at ${record.face}`);
          return;
        }
        if (stage === 'adjust' && selected?.sku === row.sku) {
          if (countDraft == null) bump(row, 1);
          else bumpCount(1);
          return;
        }
        void quick.flush();
        open(row);
        startAdjust(row);
        vibrateScan('success');
      });
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  });

  // Picking after a scan: the item last moved here is the likely one, so it
  // leads. The order is fixed for the visit — rows never jump under a thumb.
  const [pickOrder] = useState(() => (pick
    ? [...record.contents].sort((a, b) => (b.lastMoved ?? '').localeCompare(a.lastMoved ?? '')).map((row) => row.sku)
    : null));
  const rows = useMemo(() => {
    if (!pickOrder) return record.contents;
    const rank = (sku: string) => {
      const at = pickOrder.indexOf(sku);
      return at < 0 ? pickOrder.length : at;
    };
    return [...record.contents].sort((a, b) => rank(a.sku) - rank(b.sku));
  }, [pickOrder, record.contents]);

  const qtyToMove = (row: LocationBindContent) => (splitting ? Math.min(row.qty, Math.max(1, moveQty)) : row.qty);

  const scanDestination = (row: LocationBindContent) => {
    const params = new URLSearchParams({
      intent: 'location',
      moveSku: row.sku,
      moveFrom: record.code,
      moveQty: String(qtyToMove(row)),
      returnTo: withJobReturn(locationHubPath(record.code), returnTo),
    });
    navigateAfterFlush(`/m/scan?${params.toString()}`);
  };

  const moveToTyped = async (row: LocationBindContent) => {
    const toBarcode = destination.trim();
    if (!toBarcode || actionBusy) return;
    const qty = qtyToMove(row);
    setActionBusy('move');
    setError(null);
    try {
      await quick.flush();
      const receipt = await postStockTransfer({ fromBarcode: record.code, toBarcode, sku: row.sku, qty });
      applyQty(row.sku, (current) => current - receipt.qty);
      announceStockTransfer(receipt, { onSettled: refresh });
      setSelectedSku(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move stock');
    } finally {
      setActionBusy(null);
    }
  };

  const deletePlaceholder = async (row: LocationBindContent) => {
    if (actionBusy || !isProvisionalSku(row.sku) || row.qty > 0) return;
    setActionBusy('delete');
    setError(null);
    try {
      const response = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(row.sku)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not delete the placeholder');
      patchRow(row.sku, () => null);
      toast.success(`Deleted ${row.sku}`);
      setSelectedSku(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the placeholder');
    } finally {
      setActionBusy(null);
    }
  };

  if (record.contents.length === 0) return null;

  const live = selected ? countDraft ?? Math.max(0, selected.qty + (quick.pending[selected.sku] ?? 0)) : 0;
  const onHold = selected ? isProvisionalSku(selected.sku) : false;
  const canAddPhotos = selected?.stockId != null;

  const finishCapture = async (shots: CapturedShot[]) => {
    setCapture(null);
    if (!selected?.stockId || shots.length === 0) return;
    if (await uploadSkuStockShots(selected.stockId, shots)) await refresh();
  };

  const verbs = ((): readonly DetailDockVerb<StageVerb>[] => {
    if (!selected) return [];
    const back: DetailDockVerb<StageVerb> = { id: 'back', label: 'Back', icon: <ArrowLeft />, testId: 'stock-sheet-back' };
    // Next walks the room without a scan, so it lands on the count path there.
    const nextVerb: DetailDockVerb<StageVerb> | null = next
      ? { id: 'next', label: `Next · ${next.face}`, icon: <ChevronsRight />, testId: 'stock-adjust-next' }
      : null;
    if (stage === 'adjust' && countDraft != null) {
      const unchanged = countDraft === selected.qty;
      return [
        nextVerb ?? back,
        {
          id: 'count',
          label: unchanged ? `Count is ${countDraft}` : `Set count to ${countDraft}`,
          icon: <Check />,
          primary: true,
          disabled: unchanged,
          loading: actionBusy === 'count',
          testId: 'stock-adjust-set',
        },
      ];
    }
    if (stage === 'adjust') {
      const done: DetailDockVerb<StageVerb> = { id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'stock-adjust-done' };
      return nextVerb ? [nextVerb, done] : [done];
    }
    if (stage === 'move') {
      const qty = qtyToMove(selected);
      const typed = destination.trim();
      return [
        back,
        typed
          ? { id: 'commit', label: `Move ${qty} to ${typed}`, icon: <ArrowRight />, primary: true, loading: actionBusy === 'move', testId: 'stock-move-commit' }
          : { id: 'move', label: 'Scan destination', icon: <ScanBarcode />, primary: true, testId: 'stock-move-scan' },
      ];
    }
    if (stage === 'more' || stage === 'photos') return [{ ...back, variant: 'secondary' }];
    const adjust: DetailDockVerb<StageVerb> = { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal />, primary: true, testId: 'stock-adjust' };
    if (selected.qty <= 0) return [adjust];
    return [{ id: 'move', label: 'Move', icon: <ArrowRight />, testId: 'stock-move' }, adjust];
  })();

  const onVerb = (verb: StageVerb) => {
    if (!selected) return;
    setError(null);
    if (verb === 'done' && doneReturn) {
      // The scan loop: Done is "next location, camera please".
      void quick.flush().finally(doneReturn);
    } else if (verb === 'next' && next) {
      void quick.flush().finally(next.open);
    } else if (verb === 'back' || verb === 'done') {
      if (verb === 'done') void quick.flush();
      setCountDraft(null);
      setStage('rest');
    } else if (verb === 'count') {
      if (countDraft != null) return commitCount(selected, countDraft);
    } else if (verb === 'adjust') {
      startAdjust(selected);
    } else if (verb === 'move') {
      if (stage === 'move') scanDestination(selected);
      else setStage('move');
    } else if (verb === 'commit') return moveToTyped(selected);
  };

  return (
    <section ref={sectionRef} aria-label="Stock in this location" data-testid="location-stock-positions">
      {pick ? <h2 className="px-mode-page pb-1 pt-3 text-role-eyebrow text-text-soft">Select item</h2> : null}
      {rows.map((row) => (
        // ds-raw-button: the whole row is the target (F3), not its chevron.
        <button
          key={row.sku}
          type="button"
          onClick={() => {
            open(row);
            // Picking an item after a scan is choosing what to adjust.
            if (pick) startAdjust(row);
          }}
          data-testid="location-stock-row"
          className="grid min-h-14 w-full grid-cols-[2.75rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
        >
          <ItemRecordThumb imageUrl={row.imageUrl} plainEmpty className="h-11 min-h-11 w-11 rounded-lg" iconClassName="h-5 w-5" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-mode-ink">{row.productTitle?.trim() || row.sku}</span>
            {isProvisionalSku(row.sku) ? <span className="text-role-micro font-semibold text-amber-700">On hold</span> : null}
          </span>
          <span className={cn('min-w-8 text-right text-base font-bold tabular-nums', row.qty > 1 ? 'text-blue-600' : 'text-mode-ink')}>
            {row.qty}
          </span>
          <ChevronRight className="h-4 w-4 text-mode-muted" />
        </button>
      ))}

      {/* The sheet steps aside while the photo capture owns the screen: never a sheet over a sheet. */}
      <Sheet open={selected != null && capture == null} onOpenChange={(next) => { if (!next) close(); }}>
        <SheetContent
          side="bottom"
          className="p-0"
          showCloseButton={false}
          data-testid="stock-position-sheet"
          data-stage={stage}
          // Land on the record itself: no keyboard, no accidental verb.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
          // The photo viewer is a sibling layer, not an outside press.
          onInteractOutside={(event) => { if (viewerOpen) event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (viewerOpen) event.preventDefault(); }}
        >
          {selected ? (
            <>
              <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3">
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto_auto] items-center gap-2">
                  <ItemRecordThumb imageUrl={selected.imageUrl} plainEmpty className="h-12 min-h-12 w-12 rounded-lg" iconClassName="h-5 w-5" />
                  <div className="min-w-0">
                    <SheetTitle className="text-left text-base">
                      {onHold ? (
                        <InlineEditableValue
                          value={titleDraft}
                          placeholder={selected.sku}
                          onChange={(value) => {
                            setTitleDraft(value);
                            setTitleSave({ state: 'idle' });
                          }}
                          onSubmit={() => void saveTitle()}
                          onCancel={() => setTitleDraft(selected.productTitle?.trim() || '')}
                          ariaLabel="Product title"
                          valueClassName="text-base"
                          inputClassName="h-11 text-base"
                          showEditIcon={false}
                        />
                      ) : (
                        <span className="line-clamp-2">{selected.productTitle?.trim() || selected.sku}</span>
                      )}
                    </SheetTitle>
                    <p className="flex items-center gap-2 text-role-caption" aria-live="polite">
                      {onHold ? <span className="font-semibold text-amber-700">On hold</span> : null}
                      {titleSave.state === 'saving' ? <span className="text-text-muted">Saving…</span> : null}
                      {titleSave.state === 'saved' ? <span className="text-text-success">Saved</span> : null}
                      {titleSave.state === 'error' ? <span role="alert" className="font-semibold text-text-danger">{titleSave.message}</span> : null}
                    </p>
                    <SheetDescription className="sr-only">{selected.sku} at {record.face}</SheetDescription>
                  </div>
                  {/* ds-raw-button: the on-hand number is its own control; it opens the inline ±1 Adjust stage, never a full-screen keypad */}
                  <button
                    type="button"
                    className="min-h-11 rounded-lg px-1 font-mono text-role-title font-semibold tabular-nums text-mode-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                    aria-label={`Adjust; ${live} on hand`}
                    onClick={() => { if (stage !== 'adjust') startAdjust(selected); }}
                    data-testid="stock-sheet-qty"
                  >
                    {live}
                  </button>
                  <IconButton
                    size="touch"
                    icon={<MoreVertical className="h-5 w-5" />}
                    ariaLabel="More actions"
                    aria-pressed={stage === 'more'}
                    onClick={() => setStage(stage === 'more' ? 'rest' : 'more')}
                    data-testid="stock-sheet-more"
                  />
                </div>
              </SheetHeader>

              {stage === 'rest' ? (
                <div className="shrink-0 border-b border-mode-rule" data-testid="stock-sheet-facts">
                  <DetailFacts label="Stock position">
                    <DetailFact label="SKU" value={selected.sku} mono copy={selected.sku} />
                    <DetailFact label="Location" value={record.face} hint={record.room} mono copy={record.code} />
                    <DetailFact label="Last counted" value={selected.lastCounted ? formatMonthDayTimePST(selected.lastCounted) : null} />
                    <DetailFact label="Last moved" value={selected.lastMoved ? formatMonthDayTimePST(selected.lastMoved) : null} />
                    {selected.minQty != null ? (
                      <DetailFact
                        label="Reorder at"
                        value={selected.minQty}
                        hint={live <= selected.minQty ? <span className="font-semibold text-text-warning">Low stock</span> : null}
                      />
                    ) : null}
                  </DetailFacts>
                </div>
              ) : null}

              <SheetBody>
                {stage === 'rest' || stage === 'photos' ? (
                  <>
                    <SkuLinkedPhotoStrip
                      photoIds={selected.photoIds}
                      layout={stage === 'photos' ? 'grid' : 'preview'}
                      onViewAll={() => setStage('photos')}
                      deletable={onHold}
                      onDeleted={(photoId) => {
                        patchRow(selected.sku, (row) => ({ ...row, photoIds: row.photoIds.filter((id) => id !== photoId) }));
                        void refresh();
                      }}
                      onViewerOpenChange={setViewerOpen}
                    />
                    {stage === 'photos' && selected.photoIds.length === 0 ? (
                      <p className="text-role-caption text-text-muted">No photos yet.</p>
                    ) : null}
                    {stage === 'rest' ? (
                      <div className="grid grid-cols-2 gap-2" data-testid="stock-photo-actions">
                        <MobilePhotoLibraryInput
                          ref={libraryInput}
                          tabIndex={-1}
                          aria-hidden
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            if (files.length > 0) setCapture({ files });
                          }}
                          data-testid="stock-photo-library-input"
                        />
                        <Button
                          variant="secondary"
                          size="lg"
                          radius="surface"
                          icon={<Camera />}
                          disabled={!canAddPhotos}
                          onClick={() => setCapture({ files: [] })}
                          data-testid="stock-camera"
                        >
                          Camera
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          radius="surface"
                          icon={<Images />}
                          disabled={!canAddPhotos}
                          // Clicked inside this tap: iOS opens the picker only from a user gesture.
                          onClick={() => libraryInput.current?.click()}
                          data-testid="stock-choose-photos"
                        >
                          Choose photos
                        </Button>
                      </div>
                    ) : null}
                    {!canAddPhotos ? (
                      <p className="text-role-caption text-text-muted">Pair this SKU to stock to add photos.</p>
                    ) : null}
                  </>
                ) : null}

                {stage === 'adjust' ? (
                  <div className="grid gap-3">
                    {countDraft == null ? (
                      <TakeReasonChooser
                        value={takeReason}
                        onChange={(next) => {
                          void quick.flush();
                          setTakeReason(next);
                        }}
                        label="Required when removing stock"
                      />
                    ) : null}
                    {/* One ±1 face for both paths: a scan-backed burst writes put/take; a manual
                        draft is set as a count by its own verb. */}
                    <LocationQtyStrip
                      content={selected}
                      pendingDelta={countDraft == null ? quick.pending[selected.sku] ?? 0 : countDraft - selected.qty}
                      onBump={(step) => (countDraft == null ? bump(selected, step) : bumpCount(step))}
                      onCancelPending={() => (countDraft == null ? quick.cancel(selected.sku) : setCountDraft(selected.qty))}
                      onOpenKeypad={() => navigateAfterFlush(locationKeypadHref(record.code, selected.sku, { returnTo, verificationToken }))}
                    />
                    {/* The phone's scanner for this loop, folded until asked for: an item read
                        counts +1 (or picks that item), a location label renews this shelf's scan or
                        walks to the next — the same event a hardware scanner fires, so one path. */}
                    <MobileCaptureWindow
                      label="Count camera"
                      collapsedLabel="Scan items to count"
                      status={`${live} on hand`}
                      initiallyArmed={false}
                      dedupMs={ITEM_SCAN_DEDUP_MS}
                      manualLabel="SKU or item barcode"
                      onDecode={(value) => {
                        window.dispatchEvent(new CustomEvent('wedge-scan', { detail: { value }, cancelable: true }));
                      }}
                    />
                  </div>
                ) : null}

                {stage === 'move' ? (
                  <div className="grid gap-3">
                    {splitting ? (
                      <TouchQtyStepper
                        value={qtyToMove(selected)}
                        onChange={setMoveQty}
                        min={1}
                        max={selected.qty}
                        unit={['unit', 'units']}
                        label="Quantity to move"
                        disabled={actionBusy != null}
                        testId="stock-move-qty"
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-text-default">Moving all {selected.qty}</p>
                        {selected.qty > 1 ? (
                          <Button variant="secondary" size="md" radius="surface" icon={<Package />} onClick={() => setSplitting(true)} data-testid="stock-move-split">
                            Split
                          </Button>
                        ) : null}
                      </div>
                    )}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void moveToTyped(selected);
                      }}
                    >
                      <TextField
                        label="Or type a location code"
                        value={destination}
                        onChange={(value) => setDestination(value.toUpperCase())}
                        mono
                        enterKeyHint="go"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={actionBusy != null}
                        data-testid="stock-move-destination"
                      />
                    </form>
                  </div>
                ) : null}

                {stage === 'more' ? (
                  <div className="grid gap-2" data-testid="stock-more-commands">
                    {selected.qty > 1 ? (
                      <Button variant="secondary" size="lg" radius="surface" icon={<Package />} className={MORE_ROW_CLASS} onClick={() => {
                        setSplitting(true);
                        setStage('move');
                      }}>
                        Split quantity
                      </Button>
                    ) : null}
                    {selected.photoIds.length > 0 ? (
                      <Button
                        variant="secondary"
                        size="lg"
                        radius="surface"
                        icon={<Images />}
                        className={MORE_ROW_CLASS}
                        onClick={() => setStage('photos')}
                        data-testid="stock-manage-photos"
                      >
                        Manage photos <span className="ml-auto tabular-nums text-role-caption text-text-muted">{selected.photoIds.length}</span>
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="lg"
                      radius="surface"
                      icon={<ExternalLink />}
                      className={MORE_ROW_CLASS}
                      onClick={() => navigateAfterFlush(`/m/products/${encodeURIComponent(selected.sku)}`)}
                    >
                      Product, history and locations
                    </Button>
                    {onHold ? (
                      <div className="mt-3 border-t border-mode-rule pt-3">
                        <ArmedDangerButton
                          label="Delete placeholder"
                          confirmLabel="Tap again to delete"
                          size="lg"
                          radius="surface"
                          icon={<Trash2 />}
                          className="w-full"
                          loading={actionBusy === 'delete'}
                          disabled={selected.qty > 0}
                          onConfirm={() => deletePlaceholder(selected)}
                          data-testid="stock-delete-placeholder"
                        />
                        {selected.qty > 0 ? (
                          <p className="mt-1 text-role-caption text-text-muted">Count this location to 0 first.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {error ? <p role="alert" className="mt-3 text-xs font-semibold text-text-danger">{error}</p> : null}
              </SheetBody>

              <DetailDock label="Stock actions" placement="sheet" verbs={verbs} onVerb={onVerb} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {capture && selected?.stockId ? (
        <MobileNativePhotoCapture
          maxPhotos={10}
          initialFiles={capture.files}
          priorPhotos={
            selected.photoIds.length > 0
              ? selected.photoIds.map((photoId) => ({
                  id: `prior-${photoId}`,
                  previewUrl: photoContentUrl(photoId, 'thumb'),
                  fullUrl: photoContentUrl(photoId),
                  photoId,
                }))
              : selected.imageUrl
                ? [{ id: 'prior-cover', previewUrl: selected.imageUrl }]
                : []
          }
          header={
            <div className="min-w-0">
              <p className="text-role-micro text-white/60">{record.face}</p>
              <p className="break-words text-sm font-semibold text-white">{selected.productTitle?.trim() || selected.sku}</p>
            </div>
          }
          onDone={(shots) => void finishCapture(shots)}
          onCancel={() => setCapture(null)}
        />
      ) : null}
    </section>
  );
}
