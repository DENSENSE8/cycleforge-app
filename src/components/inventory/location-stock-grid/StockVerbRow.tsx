'use client';

/**
 * Inventory › Stock — the strip's **verb** row: adjust, move, delete.
 *
 * Primary verbs left, the destructive one isolated far right so a mis-click on
 * Adjust cannot empty a bin — the To-ship strip's arrangement
 * (`MorphingRowActionMenu`).
 *
 * Every verb is conditional on the SELECTION, and the condition is stated
 * rather than hidden: a selection with no writable `bin_contents` rows in it
 * disables the three buttons and hands their `title` the same sentence the
 * strip prints (`planStockBinWrites().note`), so "why can I not press this"
 * is answered where it is asked.
 *
 * Delete takes a second press and says so on its own face — never a Confirm
 * button, which would be a control that exists only to agree with the press
 * the operator just made.
 *
 * Letters (`a` / `m` / `d`) are bound by the strip and ride
 * `aria-keyshortcuts`. The faces stay clean: a letter painted on a resting
 * Button is a shortcut-cohort refusal.
 */

import {
  ArrowLeftRight,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { StockRowError } from './stock-verb-row-parts';

export interface StockVerbRowProps {
  /** Rows the operator ticked — the denominator in "2 of 7 rows skipped". */
  selectedCount: number;
  /** Rows a press will actually write. */
  targetCount: number;
  writable: boolean;
  /** The skipped remainder, or `null`. Doubles as the disabled reason. */
  remainder: string | null;
  error: string | null;
  busy: boolean;
  deleteArmed: boolean;
  onAdjust: () => void;
  onMove: () => void;
  /**
   * Replace the SKU these rows stand on. The LABEL is the verb from the rows'
   * own state — `Pair to real SKU` on a `TMP-…` placeholder, `Replace SKU` on
   * a real one — because "a reversible verb is ONE verb with two directions"
   * and the direction is a property of the row, not of a second button.
   */
  replaceLabel: string;
  /** Present ⇒ the verb refuses, and this is the reason. */
  replaceBlocked: string | null;
  /** True on the placeholder direction — a different glyph and a warmer tip. */
  pairing: boolean;
  onReplace: () => void;
  onDelete: () => void;
}

export function StockVerbRow({
  selectedCount,
  targetCount,
  writable,
  remainder,
  error,
  busy,
  deleteArmed,
  onAdjust,
  onMove,
  replaceLabel,
  replaceBlocked,
  pairing,
  onReplace,
  onDelete,
}: StockVerbRowProps) {
  const blocked = writable ? undefined : (remainder ?? undefined);
  return (
    <>
      <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
        {selectedCount === 1 ? '1 row' : `${selectedCount} rows`}
        {writable && targetCount !== selectedCount ? ` · ${targetCount} writable` : ''}
      </span>
      <Button
        type="button"
        variant="execute"
        size="sm"
        radius="pill"
        icon={<SlidersHorizontal />}
        disabled={!writable}
        title={blocked ?? 'Add to or remove from the counted quantity'}
        aria-keyshortcuts="a"
        data-testid="stock-action-adjust"
        onClick={onAdjust}
      >
        Adjust count
      </Button>
      <Button
        type="button"
        variant="execute"
        size="sm"
        radius="pill"
        icon={<ArrowLeftRight />}
        disabled={!writable}
        title={blocked ?? 'Move this stock to another location'}
        aria-keyshortcuts="m"
        data-testid="stock-action-move"
        onClick={onMove}
      >
        Move to location
      </Button>
      <Button
        type="button"
        variant="execute"
        size="sm"
        radius="pill"
        icon={pairing ? <Sparkles /> : <ArrowLeftRight />}
        disabled={replaceBlocked != null}
        title={
          replaceBlocked ??
          (pairing
            ? 'Fold this on-hold placeholder into the real product — every bin and its ledger history'
            : 'Put this stock on a different SKU in the same bin')
        }
        aria-keyshortcuts="r"
        data-testid="stock-action-replace"
        onClick={onReplace}
      >
        {replaceLabel}
      </Button>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error ? (
          <StockRowError error={error} />
        ) : remainder ? (
          <span role="status" className="text-role-caption text-text-muted">
            {remainder}
          </span>
        ) : null}
        {/* The word is the operator's; the tip says what it actually writes. */}
        <Button
          type="button"
          variant="danger"
          size="sm"
          radius="pill"
          icon={busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          disabled={!writable || busy}
          title={blocked ?? 'Takes the whole count out of the bin — the pairing leaves this list'}
          aria-keyshortcuts="d"
          data-testid="stock-action-delete"
          onClick={onDelete}
        >
          {deleteArmed ? 'Delete — press again' : 'Delete'}
        </Button>
      </div>
    </>
  );
}
