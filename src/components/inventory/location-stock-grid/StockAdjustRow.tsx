'use client';

/**
 * Inventory › Stock — the strip's **adjust** row: a signed delta, a reason, and
 * the sum it will produce.
 *
 * Presentational: every value and every callback arrives as a prop, so
 * `useStockVerbStrip` stays the one place a draft lives and this file has no
 * write in it.
 *
 * Two things here are rules rather than taste:
 *
 * - **The SUM is on screen before the press.** An adjustment that ADDS is
 *   indistinguishable from one that REPLACES until the next cycle count
 *   disagrees, so a single-row press paints `on-hand → projected` exactly as
 *   the phone's qty screen does. A batch has no single sum, so it states the
 *   per-row delta instead of inventing one.
 * - **A reason with `requires_note` blocks the commit** (the strip's
 *   `adjustReady`). The phone already enforces it; two surfaces writing
 *   different ledgers for one reason code is the drift that rule prevents.
 */

import { Minus, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';

import { ReasonCodePicker, type ReasonCode } from '@/components/sku/ReasonCodePicker';
import type { StockAdjustDirection } from '@/lib/inventory/stock-bin-verb-writes';
import {
  StockCommitFace,
  StockRowError,
  stockQtyDraft,
  StockStripInput,
} from './stock-verb-row-parts';

export interface StockAdjustRowProps {
  direction: StockAdjustDirection;
  onDirectionChange: (next: StockAdjustDirection) => void;
  qtyDraft: string;
  onQtyDraftChange: (next: string) => void;
  qty: number;
  reason: ReasonCode | null;
  onReasonChange: (next: ReasonCode | null) => void;
  note: string;
  onNoteChange: (next: string) => void;
  /** The one row's on-hand, when exactly one row is writable — else `null`. */
  onHand: number | null;
  /** How many rows this press writes. */
  targetCount: number;
  ready: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onCommit: () => void;
}

export function StockAdjustRow({
  direction,
  onDirectionChange,
  qtyDraft,
  onQtyDraftChange,
  qty,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  onHand,
  targetCount,
  ready,
  busy,
  error,
  onBack,
  onCommit,
}: StockAdjustRowProps) {
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
        Back
      </Button>
      {/*
        Two pressed-state buttons rather than one toggle: a verb button's label
        is what it DOES, so a single control would have to read "Add" while
        meaning "switch to remove".
      */}
      <Button
        type="button"
        variant={direction === 'in' ? 'success' : 'secondary'}
        size="sm"
        radius="pill"
        icon={<Plus />}
        aria-pressed={direction === 'in'}
        data-testid="stock-adjust-in"
        onClick={() => onDirectionChange('in')}
      >
        Add
      </Button>
      <Button
        type="button"
        variant={direction === 'out' ? 'dangerSoft' : 'secondary'}
        size="sm"
        radius="pill"
        icon={<Minus />}
        aria-pressed={direction === 'out'}
        data-testid="stock-adjust-out"
        onClick={() => onDirectionChange('out')}
      >
        Remove
      </Button>
      <StockStripInput
        value={qtyDraft}
        onChange={(next) => onQtyDraftChange(stockQtyDraft(next))}
        onEnter={ready ? onCommit : undefined}
        placeholder="Qty"
        ariaLabel={direction === 'in' ? 'Quantity to add' : 'Quantity to remove'}
        testId="stock-adjust-qty"
        widthClass="w-16"
        numeric
        autoFocus
      />
      <div className="w-44 shrink-0">
        <ReasonCodePicker
          direction={direction}
          value={reason?.id ?? null}
          onChange={onReasonChange}
          compact
        />
      </div>
      {/*
        ALWAYS mounted, disabled until a reason needs it — never conditionally
        rendered. It used to appear only when `requires_note` was true, so
        picking a reason grew the toolbar under the operator's cursor while they
        were aiming at Commit. `slot-table-action-bar-law.ts` forbids a
        conditional control in this band for exactly that reason; a
        fixed-width cell that is inert when it does not apply costs 56 columns
        and cannot move the geometry.
      */}
      <StockStripInput
        value={note}
        onChange={onNoteChange}
        onEnter={ready ? onCommit : undefined}
        placeholder={reason?.requires_note ? `Why — ${reason.label}` : 'Note'}
        ariaLabel="Reason note"
        testId="stock-adjust-note"
        widthClass="w-56"
        disabled={!reason?.requires_note}
      />
      {onHand != null ? (
        <span
          className="shrink-0 text-role-caption tabular-nums text-text-muted"
          data-testid="stock-adjust-projection"
        >
          {onHand} →{' '}
          <span className="font-semibold text-text-default">
            {Math.max(0, onHand + (direction === 'in' ? qty : -qty))}
          </span>
        </span>
      ) : (
        <span className="shrink-0 text-role-caption text-text-muted">
          {`${direction === 'in' ? '+' : '−'}${qty} on each of ${targetCount} rows`}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <StockRowError error={error} />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!ready || busy}
          data-testid="stock-adjust-commit"
          onClick={onCommit}
        >
          <StockCommitFace busy={busy} label={direction === 'in' ? 'Add' : 'Remove'} />
        </Button>
      </div>
    </>
  );
}
