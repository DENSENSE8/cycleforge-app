'use client';

/**
 * Inventory › Stock record › **Print label** (operator 2026-10-08): a 4 × 6
 * product label built in three sections under a step bar —
 *   1 Image — any of the SKU's photos (the Photos group's source), the cover first;
 *   2 Notes — one free-text box, remembered per SKU on this browser;
 *   3 Preview & print — the label exactly as it prints, scaled.
 * **Print** sends it silently to the label station; **Browser print** opens
 * the 4 × 6 dialog here (`useStockLabelPrint`, shared with the list's bulk print).
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { fetchSkuDetail } from '@/components/sku/sku-detail/sku-detail-api';
import { useAuth } from '@/contexts/AuthContext';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { Button } from '@/design-system/primitives/Button';
import { Popover } from '@/design-system/primitives/Popover';
import { TextField } from '@/design-system/primitives/TextField';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { readStockLabelNotes, rememberStockLabelNotes, stockLabelNotesStorage } from '@/lib/inventory/stock-label-notes';
import { stockRecordTitle } from '@/lib/inventory/stock-record';
import { photoContentUrl } from '@/lib/photos/display-url';
import { STOCK_LABEL_NOTES_MAX } from '@/lib/print/staff-print-bridge';
import type { StockLabelFace } from '@/lib/print/stockLabel';
import {
  StockLabelPhotoStrip,
  StockLabelPreviewImage,
  StockLabelPrintAt,
  StockLabelPrintButtons,
  type StockLabelImage,
} from './StockLabelSteps';
import { SKU_STOCK_PHOTOS_QUERY_KEY } from './StockPhotosGroup';
import { printableLabelImage, recordLabelImage, useStockLabelPrint } from './useStockLabelPrint';

const STEPS = [
  { id: 'image', label: 'Image' },
  { id: 'notes', label: 'Notes' },
  { id: 'print', label: 'Preview & print' },
] as const;
const LAST_STEP = STEPS.length - 1;

export function StockLabelPopover({
  record,
  anchorRef,
  onClose,
}: {
  record: LocationStockTableRow;
  /** The record's verb strip: the popover hangs under it. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const sku = record.sku;
  const orgId = useAuth().user?.organizationId ?? '';
  const [step, setStep] = useState(0);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [notes, setNotes] = useState(() => readStockLabelNotes(stockLabelNotesStorage(), orgId, sku));
  const [preview, setPreview] = useState<{ url: string } | { error: string } | null>(null);
  const print = useStockLabelPrint();

  // The Photos group's own read (`fetchSkuDetail(sku).photos`); its refresh invalidates this key too.
  const photos = useQuery({
    queryKey: [...SKU_STOCK_PHOTOS_QUERY_KEY, sku, 'label'],
    enabled: sku.trim() !== '',
    queryFn: async () => (await fetchSkuDetail(sku)).photos.map((photo) => photo.id),
  });

  const cover = printableLabelImage(record.cover_photo_url);
  const fallback = recordLabelImage(record);
  const images = useMemo((): StockLabelImage[] => {
    const ids = photos.data ?? [];
    if (ids.length > 0) {
      return ids.map((id) => ({ key: `photo:${id}`, print: photoContentUrl(id), thumb: photoContentUrl(id, 'thumb') }));
    }
    return fallback ? [{ key: 'record', print: fallback, thumb: record.image_url ?? fallback }] : [];
  }, [fallback, photos.data, record.image_url]);
  const chosen = images.find((image) => image.key === chosenKey) ?? images.find((image) => image.print === cover) ?? images[0] ?? null;
  const chosenPrint = chosen?.print ?? null;

  const face = useMemo(
    (): StockLabelFace => ({ sku, title: stockRecordTitle(record), notes: notes.trim(), image: chosenPrint }),
    [chosenPrint, notes, record, sku],
  );
  const faces = useMemo(() => [face], [face]);

  // The live preview IS the print: the same canvas, drawn on the last step.
  useEffect(() => {
    if (step !== LAST_STEP) return;
    let live = true;
    setPreview(null);
    // Loaded on the last step: the label renderer stays out of the stock page's bundle.
    import('@/lib/print/stockLabel')
      .then(({ drawStockLabel }) => drawStockLabel(face))
      .then((canvas) => {
        if (live) setPreview({ url: canvas.toDataURL('image/png') });
      })
      .catch(() => {
        if (live) setPreview({ error: 'The preview could not be drawn.' });
      });
    return () => {
      live = false;
    };
  }, [face, step]);

  return (
    <Popover
      open
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={6}
      level="panelPopover"
      aria-label={`Print label for ${sku}`}
      data-testid="stock-label-popover"
      className="flex w-[min(24rem,calc(100vw-1rem))] flex-col"
    >
      <div className="pt-1">
        <MobileStepProgress steps={STEPS} currentIndex={step} onStepPress={setStep} testId="stock-label-steps" />
      </div>

      <div className="flex min-h-0 flex-col gap-3 px-4 pb-3 pt-1">
        {step === 0 ? (
          photos.isPending && sku.trim() !== '' ? (
            <p className="text-role-caption text-text-muted">Loading photos…</p>
          ) : images.length === 0 ? (
            <p className="text-role-caption text-text-muted" data-testid="stock-label-no-photo">
              No photos for {sku} — the label prints without one.
            </p>
          ) : (
            <StockLabelPhotoStrip images={images} chosenKey={chosen?.key ?? null} coverPrint={cover} onChoose={setChosenKey} />
          )
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-1.5">
            <TextField
              label="Notes"
              multiline
              rows={6}
              value={notes}
              onChange={setNotes}
              maxLength={STOCK_LABEL_NOTES_MAX}
              autoFocus
              data-testid="stock-label-notes"
            />
            <p className="text-role-caption text-text-muted">Prints under the title. Kept for {sku} on this computer.</p>
          </div>
        ) : null}

        {step === LAST_STEP ? (
          <>
            <StockLabelPreviewImage sku={sku} preview={preview} />
            <StockLabelPrintAt print={print} />
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-hairline px-4 py-3">
        {step > 0 ? (
          <Button type="button" variant="secondary" icon={<ChevronLeft />} disabled={print.busy != null} onClick={() => setStep(step - 1)} data-testid="stock-label-back">
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < LAST_STEP ? (
          <Button
            type="button"
            variant="primary"
            iconRight={<ChevronRight />}
            onClick={() => {
              // Leaving Notes commits them: the next print of this SKU starts from these.
              if (step === 1) rememberStockLabelNotes(stockLabelNotesStorage(), orgId, sku, notes);
              setStep(step + 1);
            }}
            data-testid="stock-label-next"
          >
            Next
          </Button>
        ) : (
          <StockLabelPrintButtons print={print} faces={faces} verb="Print" onPrinted={onClose} />
        )}
      </div>
    </Popover>
  );
}
