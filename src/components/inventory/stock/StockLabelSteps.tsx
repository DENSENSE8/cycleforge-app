'use client';

/**
 * The leaf faces of the stock label prints: the record popover's photo strip
 * and preview, and the pieces it shares with the list's bulk print — where it
 * prints (Print at · Change) and the two presses (Browser print · Print).
 * State lives in the popovers and `useStockLabelPrint`.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { Printer } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { StationPicker } from '@/features/print-station/StationPicker';
import type { StockLabelFace } from '@/lib/print/stockLabel';
import { cn } from '@/utils/_cn';
import type { StockLabelPrint } from './useStockLabelPrint';

/** One photo the label can print: the full image for the label, the thumb for the strip. */
export type StockLabelImage = { key: string; print: string; thumb: string };

/** Step 1 — the SKU's photos as one radio strip; arrows move and pick, the pick holds the tab stop. */
export function StockLabelPhotoStrip({
  images,
  chosenKey,
  coverPrint,
  onChoose,
}: {
  images: readonly StockLabelImage[];
  chosenKey: string | null;
  /** The record cover's print path — its thumb says "(cover)". */
  coverPrint: string | null;
  onChoose: (key: string) => void;
}) {
  const thumbs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (move === 0) return;
    event.preventDefault();
    const at = Math.max(0, images.findIndex((image) => image.key === chosenKey));
    const next = (at + move + images.length) % images.length;
    onChoose(images[next].key);
    thumbs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Label photo" onKeyDown={onKeyDown} className="flex gap-2 overflow-x-auto pb-1" data-testid="stock-label-photos">
      {images.map((image, index) => {
        const on = image.key === chosenKey;
        return (
          // ds-raw-button: a photo radio (the thumbnail IS the face), not an action button
          <button
            key={image.key}
            ref={(node) => {
              thumbs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Photo ${index + 1} of ${images.length}${image.print === coverPrint ? ' (cover)' : ''}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChoose(image.key)}
            className={cn(
              'relative size-20 shrink-0 overflow-hidden rounded-mode-control bg-surface-sunken',
              focusRing('control'),
            )}
            data-testid={`stock-label-photo-${index}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route, not a static asset */}
            <img src={image.thumb} alt="" className="size-full object-cover" />
            {/* The chosen photo's outline is geometry over the thumb (ring-state law), never a clipped ring. */}
            <span aria-hidden className={cn(STATE_OUTLINE_CLASS, on ? 'border-2 border-fill-info' : 'border-border-soft')} />
          </button>
        );
      })}
    </div>
  );
}

/** The drawn 4 × 6 label, scaled — the preview IS the print. */
export function StockLabelPreviewImage({
  sku,
  preview,
}: {
  sku: string;
  /** The drawn label's data URL, the reason it could not be drawn, or null while drawing. */
  preview: { url: string } | { error: string } | null;
}) {
  return (
    <div className="flex justify-center">
      {preview && 'url' in preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- a drawn canvas data URL
        <img
          src={preview.url}
          alt={`4 × 6 label for ${sku}`}
          className="aspect-[2/3] w-44 rounded-mode-control border border-border-soft bg-surface-card"
          data-testid="stock-label-preview"
        />
      ) : (
        <div className="flex aspect-[2/3] w-44 items-center justify-center rounded-mode-control bg-surface-sunken px-3 text-center text-role-caption text-text-muted">
          {preview && 'error' in preview ? preview.error : 'Drawing the label…'}
        </div>
      )}
    </div>
  );
}

/** Where the run prints — `Print at <station>` · Change (the shared station picker) — and the last press's failure. */
export function StockLabelPrintAt({ print }: { print: StockLabelPrint }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-role-caption text-text-muted" data-testid="stock-label-station">
          Print at <span className="font-semibold text-text-default">{print.where ?? 'no station'}</span>
          {print.blocked ? <span className="text-text-warning"> · {print.blocked}</span> : null}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          data-testid="stock-label-change-station"
        >
          {picking ? 'Done' : 'Change'}
        </Button>
      </div>
      {picking ? (
        <StationPicker
          port={print.stations}
          chosenId={print.station?.stationId ?? null}
          onChoose={(id) => {
            print.chooseStation(id);
            setPicking(false);
          }}
          disabled={print.busy != null}
        />
      ) : null}
      {print.error ? (
        <p role="alert" className="text-role-caption text-text-danger" data-testid="stock-label-error">
          {print.error}
        </p>
      ) : null}
    </div>
  );
}

/** Browser print (the 4 × 6 dialog here) · the primary press (silent, at the station). `onPrinted` runs once it went. */
export function StockLabelPrintButtons({
  print,
  faces,
  verb,
  onPrinted,
  autoFocus = false,
}: {
  print: StockLabelPrint;
  faces: readonly StockLabelFace[];
  /** The primary press's word: `Print`, `Print all`. */
  verb: string;
  onPrinted: () => void;
  /** Focus the primary press on mount, so Enter prints (the record's Print label dialog). */
  autoFocus?: boolean;
}) {
  const press = async (dialog: boolean) => {
    if (await print.print(faces, dialog)) onPrinted();
  };
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        loading={print.busy === 'dialog'}
        disabled={faces.length === 0 || print.busy === 'station'}
        onClick={() => void press(true)}
        data-testid="stock-label-browser-print"
      >
        Browser print
      </Button>
      <Button
        type="button"
        variant="primary"
        icon={<Printer />}
        loading={print.busy === 'station'}
        disabled={faces.length === 0 || print.blocked != null || print.busy === 'dialog'}
        title={print.blocked ?? undefined}
        autoFocus={autoFocus}
        onClick={() => void press(false)}
        data-testid="stock-label-print"
      >
        {verb}
      </Button>
    </div>
  );
}
