'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, ImagePlus, ScanBarcode } from '@/components/Icons';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { StockQtySlider } from '@/design-system/components/StockQtySlider';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { locationKeypadHref } from '@/lib/mobile/location-hub-href';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { cn } from '@/utils/_cn';
import { TakeReasonChooser } from '@/components/mobile/pair/TakeReasonChooser';
import { LocationQtyStrip } from '@/components/mobile/scan/LocationQtyStrip';
import { useBinQtyCommit } from '@/components/mobile/scan/use-bin-qty-commit';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationBindContent, LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { toast } from '@/lib/toast';
import { SkuLinkedPhotoStrip } from '@/components/mobile/stock/SkuLinkedPhotoStrip';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';

function stockPhotoHref(row: LocationBindContent, returnTo: string): string | null {
  if (!row.stockId) return null;
  const params = new URLSearchParams({ sku: row.sku, back: returnTo });
  return `/m/stock/${row.stockId}/photos?${params.toString()}`;
}

/** Compact SKU positions; quantity controls and evidence arrive only after a tap. */
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
  const [error, setError] = useState<string | null>(null);
  const [takeReason, setTakeReason] = useState<TakeReasonChoice>(null);
  const [manualQty, setManualQty] = useState(0);
  const [manualBusy, setManualBusy] = useState(false);
  const selected = record.contents.find((row) => row.sku === selectedSku) ?? null;
  const takePayload = useMemo(() => takeReasonPayload(takeReason), [takeReason]);
  const commitReason = useMemo(
    () => (takePayload.ok ? { reason: takePayload.reason, notes: takePayload.notes } : undefined),
    [takePayload],
  );

  const applyQty = useCallback(
    (sku: string, next: (previous: number) => number) => {
      queryClient.setQueryData<LocationRecord>(key, (previous) => previous
        ? {
            ...previous,
            contents: previous.contents
              .map((row) => row.sku === sku ? { ...row, qty: Math.max(0, next(row.qty)) } : row)
              .filter((row) => row.qty > 0),
          }
        : previous);
    },
    [key, queryClient],
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

  const bump = useCallback((row: LocationBindContent, step: number) => {
    setError(null);
    if (step < 0 && !takePayload.ok) {
      setError(takePayload.error);
      vibrateScan('reject');
      return false;
    }
    const accepted = quick.bump(row.sku, step, row.qty);
    vibrateScan(accepted ? 'success' : 'reject');
    return accepted;
  }, [quick, takePayload]);

  const changeReason = useCallback((next: TakeReasonChoice) => {
    void quick.flush();
    setTakeReason(next);
  }, [quick]);

  const navigateAfterFlush = useCallback((href: string) => {
    void quick.flush().finally(() => router.push(href));
  }, [quick, router]);

  const setExactCount = useCallback(async () => {
    if (!selected || manualBusy || manualQty === selected.qty) return;
    setManualBusy(true);
    setError(null);
    try {
      await commitStockRequest(
        stockSetRequest(
          {
            rowId: `${record.code}:${selected.sku}`,
            barcode: record.code,
            sku: selected.sku,
            qty: selected.qty,
            face: `${record.face} · ${selected.sku}`,
          },
          manualQty,
          { staffId: user?.staffId, reason: 'MANUAL_COUNT' },
        ),
      );
      applyQty(selected.sku, () => manualQty);
      toast.success(`${record.face}: ${selected.qty} → ${manualQty}`);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set the count');
    } finally {
      setManualBusy(false);
    }
  }, [applyQty, key, manualBusy, manualQty, queryClient, record.code, record.face, selected, user?.staffId]);

  if (record.contents.length === 0) return null;

  return (
    <section aria-label="Stock in this location" data-testid="location-stock-positions">
      {record.contents.map((row) => {
        const onHold = isProvisionalSku(row.sku);
        return (
          <button
            key={row.sku}
            type="button"
            onClick={() => {
              setError(null);
              setManualQty(row.qty);
              setSelectedSku(row.sku);
            }}
            data-testid="location-stock-row"
            className="grid min-h-14 w-full grid-cols-[2.75rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
          >
            <ItemRecordThumb
              imageUrl={row.imageUrl}
              plainEmpty
              className="h-11 min-h-11 w-11 rounded-lg"
              iconClassName="h-5 w-5"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-mode-ink">
                {row.productTitle?.trim() || row.sku}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] text-mode-muted">{row.sku}</span>
                {onHold ? <span className="shrink-0 text-[10px] font-semibold text-amber-700">On hold</span> : null}
              </span>
            </span>
            <span className={cn(
              'min-w-8 text-right text-base font-bold tabular-nums',
              row.qty > 1 ? 'text-blue-600' : 'text-mode-ink',
            )}>
              {row.qty}
            </span>
            <ChevronRight className="h-4 w-4 text-mode-muted" />
          </button>
        );
      })}

      <Sheet open={selected != null} onOpenChange={(open) => {
        if (!open) {
          void quick.flush();
          setSelectedSku(null);
          setError(null);
        }
      }}>
        <SheetContent side="bottom" className="max-h-[86dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {selected ? (
            <>
              <SheetHeader className="border-b border-border-soft pr-12">
                <SheetTitle className="truncate">{selected.productTitle?.trim() || selected.sku}</SheetTitle>
                <SheetDescription className="font-mono">{selected.sku} · {record.face}</SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto p-4">
                <SkuLinkedPhotoStrip sku={selected.sku} />
                {stockPhotoHref(selected, returnTo) ? (
                  <Button
                    variant="primary"
                    size="lg"
                    radius="surface"
                    icon={<ImagePlus />}
                    className="mb-4 mt-4 w-full"
                    onClick={() => navigateAfterFlush(stockPhotoHref(selected, returnTo)!)}
                  >
                    Add photo
                  </Button>
                ) : (
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-surface-warning px-3 py-2 text-xs font-semibold text-text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Pair this SKU to stock before adding photos.
                  </div>
                )}
                {verificationToken ? (
                  <>
                    <TakeReasonChooser value={takeReason} onChange={changeReason} label="Required when removing stock" />
                    {error ? <p role="alert" className="mt-3 text-xs font-semibold text-text-danger">{error}</p> : null}
                    <div className="mt-4">
                      <LocationQtyStrip
                        content={selected}
                        pendingDelta={quick.pending[selected.sku] ?? 0}
                        onBump={(step) => bump(selected, step)}
                        onCancelPending={() => quick.cancel(selected.sku)}
                        onOpenKeypad={() => navigateAfterFlush(locationKeypadHref(record.code, selected.sku, { returnTo, verificationToken }))}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 rounded-xl border border-border-soft bg-surface-card p-3">
                    <div>
                      <p className="text-sm font-semibold text-text-default">Set exact count</p>
                      <p className="mt-1 text-xs text-text-muted">Manual reconciliation does not require a location scan.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StockQtySlider
                        value={manualQty}
                        onChange={setManualQty}
                        anchor={selected.qty}
                        ariaLabel={`Exact count for ${selected.sku}`}
                        disabled={manualBusy}
                        testId="location-manual-count"
                      />
                      <Button
                        variant="ink"
                        size="lg"
                        radius="surface"
                        loading={manualBusy}
                        disabled={manualQty === selected.qty}
                        onClick={() => void setExactCount()}
                        data-testid="location-manual-count-submit"
                      >
                        Set {manualQty}
                      </Button>
                    </div>
                    {error ? <p role="alert" className="text-xs font-semibold text-text-danger">{error}</p> : null}
                    <Button
                      href={`/m/scan?intent=location&returnTo=${encodeURIComponent('/m/stock')}`}
                      variant="ghost"
                      size="md"
                      radius="surface"
                      icon={<ScanBarcode />}
                      className="w-full"
                    >
                      Scan for rapid ± changes
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
