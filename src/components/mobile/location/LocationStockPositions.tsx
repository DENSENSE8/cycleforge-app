'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Images,
  MoreHorizontal,
  Package,
  Pencil,
  ScanBarcode,
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
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { announceStockTransfer, postStockTransfer } from '@/lib/inventory/stock-transfer-client';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { locationHubPath, locationKeypadHref } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { stockPhotosHref } from '@/lib/nav/route-tree';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';
import { cn } from '@/utils/_cn';
import { TakeReasonChooser } from '@/components/mobile/pair/TakeReasonChooser';
import { LocationQtyStrip } from '@/components/mobile/scan/LocationQtyStrip';
import { useBinQtyCommit } from '@/components/mobile/scan/use-bin-qty-commit';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationBindContent, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { SkuLinkedPhotoStrip } from '@/components/mobile/stock/SkuLinkedPhotoStrip';

/** One task at a time in ONE sheet (docs/mobile-first/V2_OBJECT_FIRST.md §5). */
type Stage = 'rest' | 'adjust' | 'move' | 'more' | 'photos';
type TitleSave = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string };
type StageVerb = 'camera' | 'adjust' | 'move' | 'back' | 'done' | 'set' | 'commit';

const MORE_ROW_CLASS = 'w-full justify-start';

/**
 * Stock at one location as flat rows; a tap opens the stock position sheet:
 * identity → evidence → next verb (Camera · Adjust · Move). Counting, moving
 * and record management are stages of that sheet, never a resting form.
 */
export function LocationStockPositions({
  record,
  returnTo,
  verificationToken,
}: {
  record: LocationRecord;
  returnTo: string;
  verificationToken: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = useMemo(() => locationRecordQueryKey(record.code), [record.code]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('rest');
  const [error, setError] = useState<string | null>(null);
  const [takeReason, setTakeReason] = useState<TakeReasonChoice>(null);
  const [manualQty, setManualQty] = useState(0);
  const [manualBusy, setManualBusy] = useState(false);
  const [moveQty, setMoveQty] = useState(1);
  const [splitting, setSplitting] = useState(false);
  const [destination, setDestination] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSave, setTitleSave] = useState<TitleSave>({ state: 'idle' });
  const [titleEditKey, setTitleEditKey] = useState(0);
  const [actionBusy, setActionBusy] = useState<'move' | 'delete' | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
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
    onCommitted: useCallback(({ sku, binQty }: { sku: string; binQty: number | null }) => {
      if (binQty != null) applyQty(sku, () => binQty);
    }, [applyQty]),
    onFailed: useCallback(({ sku, delta, message }: { sku: string; delta: number; message: string }) => {
      applyQty(sku, (qty) => qty - delta);
      setError(message);
    }, [applyQty]),
  });

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [key, queryClient]);

  const open = (row: LocationBindContent) => {
    setError(null);
    setStage('rest');
    setManualQty(row.qty);
    setMoveQty(Math.max(1, row.qty));
    setSplitting(false);
    setDestination('');
    setTitleDraft(row.productTitle?.trim() || '');
    setTitleSave({ state: 'idle' });
    setSelectedSku(row.sku);
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

  const close = () => {
    void quick.flush();
    // Dismissal is a save gesture for the title, never a discard.
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

  const setExactCount = async (row: LocationBindContent) => {
    if (manualBusy || manualQty === row.qty) return;
    setManualBusy(true);
    setError(null);
    try {
      await commitStockRequest(
        stockSetRequest(
          {
            rowId: `${record.code}:${row.sku}`,
            barcode: record.code,
            sku: row.sku,
            qty: row.qty,
            face: `${record.face} · ${row.sku}`,
          },
          manualQty,
          { staffId: user?.staffId, reason: 'MANUAL_COUNT' },
        ),
      );
      applyQty(row.sku, () => manualQty);
      toast.success(`${record.face}: ${row.qty} → ${manualQty}`);
      setStage('rest');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set the count');
    } finally {
      setManualBusy(false);
    }
  };

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

  const copy = async (text: string, what: string) => {
    if (await copyToClipboard(text)) toast.success(`Copied ${what}`);
    else toast.error(`Could not copy the ${what}`);
  };

  if (record.contents.length === 0) return null;

  const live = selected ? Math.max(0, selected.qty + (quick.pending[selected.sku] ?? 0)) : 0;
  const onHold = selected ? isProvisionalSku(selected.sku) : false;
  const photoHref = selected?.stockId ? stockPhotosHref(selected.stockId, { sku: selected.sku, back: returnTo }) : null;

  const verbs = ((): readonly DetailDockVerb<StageVerb>[] => {
    if (!selected) return [];
    const back: DetailDockVerb<StageVerb> = { id: 'back', label: 'Back', icon: <ArrowLeft />, testId: 'stock-sheet-back' };
    if (stage === 'adjust') {
      if (verificationToken) return [{ id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'stock-adjust-done' }];
      return [
        back,
        {
          id: 'set',
          label: manualQty === selected.qty ? `Count is ${selected.qty}` : `Set count to ${manualQty}`,
          icon: <Check />,
          primary: true,
          disabled: manualQty === selected.qty,
          loading: manualBusy,
          testId: 'stock-adjust-set',
        },
      ];
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
    if (stage === 'more') return [{ ...back, variant: 'secondary' }];
    if (stage === 'photos') {
      return [back, { id: 'camera', label: 'Add photos', icon: <Camera />, primary: true, disabled: !photoHref, testId: 'stock-photos-camera' }];
    }
    const camera: DetailDockVerb<StageVerb> = { id: 'camera', label: 'Camera', icon: <Camera />, disabled: !photoHref, testId: 'stock-camera' };
    const adjust: DetailDockVerb<StageVerb> = { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal />, testId: 'stock-adjust' };
    // Nothing on the shelf → nothing to move; the camera becomes the next verb.
    if (selected.qty <= 0) return [{ ...camera, primary: true }, adjust];
    return [camera, adjust, { id: 'move', label: 'Move', icon: <ArrowRight />, primary: true, testId: 'stock-move' }];
  })();

  const onVerb = (verb: StageVerb) => {
    if (!selected) return;
    setError(null);
    if (verb === 'back' || verb === 'done') {
      if (verb === 'done') void quick.flush();
      setStage('rest');
    } else if (verb === 'camera' && photoHref) navigateAfterFlush(photoHref);
    else if (verb === 'adjust') {
      setManualQty(selected.qty);
      setStage('adjust');
    } else if (verb === 'move') {
      if (stage === 'move') scanDestination(selected);
      else setStage('move');
    } else if (verb === 'set') return setExactCount(selected);
    else if (verb === 'commit') return moveToTyped(selected);
  };

  return (
    <section aria-label="Stock in this location" data-testid="location-stock-positions">
      {record.contents.map((row) => (
        // ds-raw-button: the whole row is the target (F3), not its chevron.
        <button
          key={row.sku}
          type="button"
          onClick={() => open(row)}
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

      <Sheet open={selected != null} onOpenChange={(next) => { if (!next) close(); }}>
        <SheetContent
          side="bottom"
          className="p-0"
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
              <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto_auto] items-center gap-3">
                  <ItemRecordThumb imageUrl={selected.imageUrl} plainEmpty className="h-12 min-h-12 w-12 rounded-lg" iconClassName="h-5 w-5" />
                  <div className="min-w-0">
                    <SheetTitle className="text-left text-base">
                      {onHold ? (
                        <InlineEditableValue
                          key={titleEditKey}
                          value={titleDraft}
                          placeholder={selected.sku}
                          onChange={(value) => {
                            setTitleDraft(value);
                            setTitleSave({ state: 'idle' });
                          }}
                          onSubmit={() => void saveTitle()}
                          onCancel={() => setTitleDraft(selected.productTitle?.trim() || '')}
                          autoFocus={titleEditKey > 0}
                          ariaLabel="Product title"
                          valueClassName="text-base"
                          inputClassName="h-11 text-base"
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
                  <span className="font-mono text-role-title font-semibold tabular-nums text-mode-ink" aria-label={`${live} on hand`} data-testid="stock-sheet-qty">
                    {live}
                  </span>
                  <IconButton
                    size="touch"
                    icon={<MoreHorizontal className="h-5 w-5" />}
                    ariaLabel="More actions"
                    aria-pressed={stage === 'more'}
                    onClick={() => setStage(stage === 'more' ? 'rest' : 'more')}
                    data-testid="stock-sheet-more"
                  />
                </div>
              </SheetHeader>

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
                    {!photoHref ? (
                      <p className="text-role-caption text-text-muted">Pair this SKU to stock to add photos.</p>
                    ) : null}
                  </>
                ) : null}

                {stage === 'adjust' ? (
                  verificationToken ? (
                    <div className="grid gap-3">
                      <TakeReasonChooser
                        value={takeReason}
                        onChange={(next) => {
                          void quick.flush();
                          setTakeReason(next);
                        }}
                        label="Required when removing stock"
                      />
                      <LocationQtyStrip
                        content={selected}
                        pendingDelta={quick.pending[selected.sku] ?? 0}
                        onBump={(step) => bump(selected, step)}
                        onCancelPending={() => quick.cancel(selected.sku)}
                        onOpenKeypad={() => navigateAfterFlush(locationKeypadHref(record.code, selected.sku, { returnTo, verificationToken }))}
                      />
                    </div>
                  ) : (
                    <TouchQtyStepper
                      value={manualQty}
                      onChange={setManualQty}
                      unit={['unit', 'units']}
                      label={`Count of ${selected.sku} at ${record.face}`}
                      disabled={manualBusy}
                      testId="stock-adjust-count"
                    />
                  )
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
                    {onHold ? (
                      <Button variant="secondary" size="lg" radius="surface" icon={<Pencil />} className={MORE_ROW_CLASS} onClick={() => {
                        setStage('rest');
                        setTitleEditKey((n) => n + 1);
                      }}>
                        Edit title
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
                    <Button variant="secondary" size="lg" radius="surface" icon={<Copy />} className={MORE_ROW_CLASS} onClick={() => void copy(selected.sku, 'SKU')}>
                      Copy SKU <span className="ml-auto font-mono text-role-caption text-text-muted">{selected.sku}</span>
                    </Button>
                    <Button variant="secondary" size="lg" radius="surface" icon={<Copy />} className={MORE_ROW_CLASS} onClick={() => void copy(record.code, 'location')}>
                      Copy location <span className="ml-auto font-mono text-role-caption text-text-muted">{record.face}</span>
                    </Button>
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
    </section>
  );
}
