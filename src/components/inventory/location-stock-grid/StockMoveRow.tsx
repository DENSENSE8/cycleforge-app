'use client';

/**
 * Inventory › Stock — the strip's **move** row: where this stock is going, and
 * how much of it.
 *
 * Presentational: the destination list is {@link useLocationPickerOptions}
 * (barcoded locations only, because `/api/transfers` resolves both bins by
 * barcode), and the write is the strip's.
 *
 * A BLANK qty means the whole count, which is the common desk intent — "this
 * SKU lives over there now". The face says which it is before the press, since
 * "all 7" and "7 of each" are different promises on a multi-row selection.
 */

import { ArrowLeftRight } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';

import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import {
  StockCommitFace,
  StockRowError,
  stockQtyDraft,
  StockStripInput,
} from './stock-verb-row-parts';
import type { LocationPickerOption } from './useLocationPickerOptions';

export interface StockMoveRowProps {
  /** The one row's face, when exactly one row is writable — else `null`. */
  sourceFace: string | null;
  /** The one row's on-hand, for the qty placeholder and the "all N" face. */
  onHand: number | null;
  targetCount: number;
  destination: string | null;
  onDestinationChange: (next: string | null) => void;
  options: readonly LocationPickerOption[];
  optionsLoading: boolean;
  qtyDraft: string;
  onQtyDraftChange: (next: string) => void;
  /** `null` ⇒ the whole count on every picked row. */
  qty: number | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onCommit: () => void;
}

export function StockMoveRow({
  sourceFace,
  onHand,
  targetCount,
  destination,
  onDestinationChange,
  options,
  optionsLoading,
  qtyDraft,
  onQtyDraftChange,
  qty,
  ready,
  busy,
  error,
  onBack,
  onCommit,
}: StockMoveRowProps) {
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
        Back
      </Button>
      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
      <span className="shrink-0 text-role-caption text-text-muted">
        {sourceFace ?? `${targetCount} pairs`} →
      </span>
      <SearchableSelectField
        value={destination}
        onChange={(next) => onDestinationChange(next == null ? null : String(next))}
        options={options}
        loading={optionsLoading}
        placeholder="Destination"
        searchPlaceholder="Bin code, name or room…"
        emptyMessage="No matching location"
        ariaLabel="Location to move this stock to"
        autoFocus
        className="w-56"
        testId="stock-move-destination"
      />
      <StockStripInput
        value={qtyDraft}
        onChange={(next) => onQtyDraftChange(stockQtyDraft(next))}
        onEnter={ready ? onCommit : undefined}
        placeholder={onHand != null ? String(onHand) : 'all'}
        ariaLabel="Quantity to move — blank moves the whole count"
        testId="stock-move-qty"
        widthClass="w-16"
        numeric
      />
      <span className="shrink-0 text-role-caption text-text-muted">
        {qty == null
          ? onHand != null
            ? `all ${onHand}`
            : 'the whole count on each row'
          : `${qty} of each`}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <StockRowError error={error} />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!ready || busy}
          data-testid="stock-move-commit"
          onClick={onCommit}
        >
          <StockCommitFace busy={busy} label="Move" />
        </Button>
      </div>
    </>
  );
}
