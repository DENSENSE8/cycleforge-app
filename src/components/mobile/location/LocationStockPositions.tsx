'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ExternalLink,
  Images,
  MoreVertical,
  ChevronsRight,
  SlidersHorizontal,
  Trash2,
} from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, IconButton } from '@/design-system/primitives';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { useAuth } from '@/contexts/AuthContext';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { resolveScannedItemSku } from '@/lib/inventory/scanned-item-sku';
import { routeScan } from '@/lib/barcode-routing';
import { recordStockAdjust } from '@/lib/mobile/stock-adjust-session';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { captureTimeFromFile, shutterCaptureTime } from '@/lib/photos/capture-time';
import { canUseContinuousWebCamera } from '@/lib/photos/capture-session';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { announceStockTransfer, postStockTransfer, type StockTransferReceipt } from '@/lib/inventory/stock-transfer-client';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { locationKeypadHref } from '@/lib/mobile/location-hub-href';
import { useLocalStorage } from '@/hooks/_storage';
import { OPEN_TOTES_QUERY_KEY, TOTE_PREFS_DEFAULT, TOTE_PREFS_KEY, type TotePrefs } from '@/components/mobile/v2/stock/open-totes';
import { moveTargetFace, StockMoveStage, type MoveTab, type MoveTarget } from './StockMoveStage';
import { photoContentUrl } from '@/lib/photos/display-url';
import { ensureSkuStockId, uploadSkuStockShots } from '@/lib/photos/sku-stock-photo-upload';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
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
  MobileNativePhotoInput,
  MobilePhotoLibraryInput,
  type CapturedShot,
} from '@/components/mobile/photos/MobileNativePhotoCapture';

/** One task at a time in ONE sheet (docs/mobile-first/V2_OBJECT_FIRST.md §5). */
type Stage = 'rest' | 'adjust' | 'move' | 'more' | 'photos';
type TitleSave = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string };
type StageVerb = 'adjust' | 'move' | 'back' | 'done' | 'count' | 'commit' | 'next' | 'camera' | 'library';

const MORE_ROW_CLASS = 'w-full justify-start';
/** The same unit is scanned again on purpose when counting: a short same-code cooldown. */
const ITEM_SCAN_DEDUP_MS = 900;

/**
 * Stock at one location as flat rows: photo flush on the left (tap = full
 * screen), title, count, a blue camera, chevron. The camera opens the camera
 * itself — the live camera, else the phone's camera app — never a chooser; a
 * SKU with no stock row gets one on its first photo. A row tap opens the stock
 * position sheet: identity and count in the header, evidence, then the dock
 * (Camera · Choose · Move over Adjust). Adjust is ±1 first; the keypad lives under More.
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
  const [moveTab, setMoveTab] = useState<MoveTab>('tote');
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  /** The tote this phone loaded last — shared with the location's tote sheet. */
  const [totePrefs, setTotePrefs] = useLocalStorage<TotePrefs>(TOTE_PREFS_KEY, TOTE_PREFS_DEFAULT);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSave, setTitleSave] = useState<TitleSave>({ state: 'idle' });
  const [actionBusy, setActionBusy] = useState<'move' | 'delete' | 'count' | null>(null);
  /** The ±1 draft while adjusting without a location scan; null otherwise. */
  const [countDraft, setCountDraft] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  /**
   * The house photo capture, open over the page (the sheet steps aside) for
   * one row: `sku` is whose photos these are (a row's inline camera, or the
   * open sheet's); `files` = picked from the library first.
   */
  const [capture, setCapture] = useState<{ sku: string; files: File[] } | null>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  /** The phone's own camera (no live camera in this browser) and whose photos it is taking. */
  const cameraInput = useRef<HTMLInputElement>(null);
  const cameraSku = useRef<string | null>(null);
  /** A row photo open full screen. */
  const [rowViewer, setRowViewer] = useState<SwipePhotoSlide[] | null>(null);
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
    setMoveTab('tote');
    setMoveTarget(null);
    setCountDraft(null);
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
      // A tote plate is never an item here: the tote sheet (or the tote's own record) takes it.
      if (route?.type === 'handling-unit') return;
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

  /**
   * Move: into a tote (the tote load, one line) or onto another location (a
   * transfer). Either way the sheet closes on this location with the same
   * "Moved N to X · Undo" receipt — Undo is a transfer back from the tote or shelf.
   */
  const commitMove = async (row: LocationBindContent) => {
    if (!moveTarget || actionBusy) return;
    const qty = Math.min(row.qty, Math.max(1, moveQty));
    setActionBusy('move');
    setError(null);
    try {
      await quick.flush();
      let receipt: StockTransferReceipt;
      if (moveTarget.kind === 'tote') {
        const { tote } = moveTarget;
        const commandId = safeRandomUUID();
        const response = await fetch(`/api/handling-units/${tote.id}/load`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
          body: JSON.stringify({
            locationCode: record.code,
            lines: [{ sku: row.sku, qty }],
            park: false,
            idempotencyKey: commandId,
          }),
        });
        const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!response.ok || !body?.success) throw new Error(body?.error || `Could not move into ${tote.code}`);
        setTotePrefs((prev) => ({ ...prev, toteId: tote.id }));
        void queryClient.invalidateQueries({ queryKey: OPEN_TOTES_QUERY_KEY });
        receipt = { fromBarcode: record.code, toBarcode: tote.code, sku: row.sku, qty };
      } else {
        receipt = await postStockTransfer({ fromBarcode: record.code, toBarcode: moveTarget.code, sku: row.sku, qty });
      }
      vibrateScan('success');
      applyQty(row.sku, (current) => current - receipt.qty);
      announceStockTransfer(receipt, { onSettled: refresh });
      setSelectedSku(null);
      await refresh();
    } catch (cause) {
      vibrateScan('reject');
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
  const captureRow = capture ? record.contents.find((row) => row.sku === capture.sku) ?? null : null;

  const finishCapture = async (row: LocationBindContent, shots: CapturedShot[]) => {
    setCapture(null);
    if (shots.length === 0) return;
    // A bin SKU with no stock row yet gets one: its first photo needs an anchor.
    const stockId = row.stockId ?? (await ensureSkuStockId(row.sku));
    if (stockId == null) {
      for (const shot of shots) URL.revokeObjectURL(shot.previewUrl);
      return;
    }
    if (await uploadSkuStockShots(stockId, shots)) await refresh();
  };

  /**
   * Camera means the camera: the live multi-shot camera when the browser
   * offers one, else the phone's own camera app straight from this tap (no
   * Device camera / Choose photos screen in between), uploading on return.
   */
  const openCamera = (row: LocationBindContent) => {
    if (canUseContinuousWebCamera()) {
      setCapture({ sku: row.sku, files: [] });
      return;
    }
    cameraSku.current = row.sku;
    cameraInput.current?.click();
  };

  const uploadCameraFiles = async (files: readonly File[]) => {
    const row = record.contents.find((candidate) => candidate.sku === cameraSku.current) ?? null;
    cameraSku.current = null;
    if (!row || files.length === 0) return;
    const shots: CapturedShot[] = [];
    try {
      for (const file of files) {
        const compressed = await compressPhotoForUpload(file, { quality: 0.85, source: 'mobile-native-camera' });
        shots.push({
          id: safeRandomUUID(),
          blob: compressed.blob,
          previewUrl: URL.createObjectURL(compressed.blob),
          capturedAtMs: captureTimeFromFile(file) ?? shutterCaptureTime(),
          source: 'native-camera',
        });
      }
    } catch (cause) {
      for (const shot of shots) URL.revokeObjectURL(shot.previewUrl);
      toast.error(cause instanceof Error ? cause.message : 'Could not prepare the photo.', { position: 'top-center' });
      return;
    }
    await finishCapture(row, shots);
  };

  /** The row's photo, full screen: its own photos to swipe through, else the catalog image. */
  const viewRowPhotos = (row: LocationBindContent) => {
    const slides: SwipePhotoSlide[] = row.photoIds.length > 0
      ? row.photoIds.map((photoId) => ({ id: String(photoId), previewUrl: photoContentUrl(photoId) }))
      : row.imageUrl
        ? [{ id: 'cover', previewUrl: row.imageUrl }]
        : [];
    if (slides.length > 0) setRowViewer(slides);
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
      const qty = Math.min(selected.qty, Math.max(1, moveQty));
      return [
        back,
        moveTarget
          ? { id: 'commit', label: `Move ${qty} to ${moveTargetFace(moveTarget)}`, icon: <ArrowRight />, primary: true, loading: actionBusy === 'move', testId: 'stock-move-commit' }
          : { id: 'commit', label: moveTab === 'tote' ? 'Scan a tote' : 'Scan a location', icon: <ArrowRight />, primary: true, disabled: true, testId: 'stock-move-commit' },
      ];
    }
    if (stage === 'more' || stage === 'photos') return [{ ...back, variant: 'secondary' }];
    // Rest: the photo verbs and Move share one aligned row; Adjust is the primary under it.
    const adjust: DetailDockVerb<StageVerb> = { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal />, primary: true, testId: 'stock-adjust' };
    const camera: DetailDockVerb<StageVerb> = { id: 'camera', label: 'Camera', icon: <Camera />, testId: 'stock-camera' };
    const library: DetailDockVerb<StageVerb> = { id: 'library', label: 'Choose', icon: <Images />, testId: 'stock-choose-photos' };
    if (selected.qty <= 0) return [camera, library, adjust];
    return [camera, library, { id: 'move', label: 'Move', icon: <ArrowRight />, testId: 'stock-move' }, adjust];
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
    } else if (verb === 'camera') {
      openCamera(selected);
    } else if (verb === 'library') {
      // Clicked inside this tap: iOS opens the picker only from a user gesture.
      libraryInput.current?.click();
    } else if (verb === 'move') {
      setStage('move');
    } else if (verb === 'commit') return commitMove(selected);
  };

  return (
    <section ref={sectionRef} aria-label="Stock in this location" data-testid="location-stock-positions">
      <MobileNativePhotoInput
        ref={cameraInput}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void uploadCameraFiles(files);
        }}
        data-testid="stock-native-camera-input"
      />
      <MobilePhotoLibraryInput
        ref={libraryInput}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0 && selected) setCapture({ sku: selected.sku, files });
        }}
        data-testid="stock-photo-library-input"
      />
      {pick ? <h2 className="px-mode-page pb-1 pt-3 text-role-eyebrow text-text-soft">Select item</h2> : null}
      {rows.map((row) => {
        const name = row.productTitle?.trim() || row.sku;
        return (
          <div
            key={row.sku}
            className="grid min-h-20 grid-cols-[5rem_minmax(0,1fr)_auto] items-stretch border-b border-mode-rule bg-mode-panel"
            data-testid="location-stock-row-shell"
          >
            {/* The photo is the row's left edge: flush top, left and bottom, cropped to its middle. */}
            {row.imageUrl ? (
              // ds-raw-button: an image tile (tap = full screen), not a Button shape — as SkuLinkedPhotoStrip's tiles.
              <button
                type="button"
                aria-label={`View photos of ${name}`}
                onClick={() => viewRowPhotos(row)}
                data-walk-through
                data-testid="location-stock-row-photo"
                className="h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
              >
                <ItemRecordThumb imageUrl={row.imageUrl} fit="cover" className="h-full min-h-20 w-20" />
              </button>
            ) : (
              <ItemRecordThumb plainEmpty className="h-full min-h-20 w-20" iconClassName="h-6 w-6" />
            )}
            {/* ds-raw-button: the row's middle (title + count) is the one target for the sheet; the photo and camera beside it are their own controls. */}
            <button
              type="button"
              aria-label={`${name}, ${row.qty} in stock`}
              onClick={() => {
                open(row);
                // Picking an item after a scan is choosing what to adjust.
                if (pick) startAdjust(row);
              }}
              data-testid="location-stock-row"
              // A horizontal drag that starts on the row is the location walk, not a tap.
              data-walk-through
              className="flex min-w-0 items-center gap-3 py-2 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-base font-semibold leading-snug text-mode-ink">{name}</span>
                {isProvisionalSku(row.sku) ? <span className="text-role-micro font-semibold text-amber-700">On hold</span> : null}
              </span>
              <span className={cn('min-w-10 text-right text-2xl font-bold tabular-nums', stockQtyToneClass(row.qty, { inkClass: 'text-mode-ink' }))}>
                {row.qty}
              </span>
            </button>
            <Button
              variant="primary"
              size="md"
              iconOnly
              icon={<Camera />}
              ariaLabel={`Take photos of ${name}`}
              onClick={() => openCamera(row)}
              className="mx-3 self-center"
              data-testid="location-stock-row-camera"
            >
              Photo
            </Button>
          </div>
        );
      })}

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
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
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

              {/* At rest the body is the photos, under the facts; with none (and no error) it is not drawn. */}
              {stage !== 'rest' || error || selected.photoIds.length > 0 ? (
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
                  <StockMoveStage
                    row={selected}
                    recordCode={record.code}
                    qty={Math.min(selected.qty, Math.max(1, moveQty))}
                    onQtyChange={setMoveQty}
                    tab={moveTab}
                    onTabChange={setMoveTab}
                    target={moveTarget}
                    onTarget={setMoveTarget}
                    lastToteId={totePrefs.toteId}
                    busy={actionBusy != null}
                  />
                ) : null}

                {stage === 'more' ? (
                  <div className="grid gap-2" data-testid="stock-more-commands">
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
              ) : null}

              <DetailDock label="Stock actions" placement="sheet" verbs={verbs} onVerb={onVerb} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {capture && captureRow ? (
        <MobileNativePhotoCapture
          maxPhotos={10}
          initialFiles={capture.files}
          priorPhotos={
            captureRow.photoIds.length > 0
              ? captureRow.photoIds.map((photoId) => ({
                  id: `prior-${photoId}`,
                  previewUrl: photoContentUrl(photoId, 'thumb'),
                  fullUrl: photoContentUrl(photoId),
                  photoId,
                }))
              : captureRow.imageUrl
                ? [{ id: 'prior-cover', previewUrl: captureRow.imageUrl }]
                : []
          }
          header={
            <div className="min-w-0">
              <p className="text-role-micro text-white/60">{record.face}</p>
              <p className="break-words text-sm font-semibold text-white">{captureRow.productTitle?.trim() || captureRow.sku}</p>
            </div>
          }
          onDone={(shots) => void finishCapture(captureRow, shots)}
          onCancel={() => setCapture(null)}
        />
      ) : null}

      <MobileSwipePhotoViewer
        slides={rowViewer ?? []}
        open={rowViewer != null}
        initialIndex={0}
        onClose={() => setRowViewer(null)}
      />
    </section>
  );
}
