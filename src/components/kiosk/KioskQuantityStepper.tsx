'use client';

/**
 * The kiosk's ONE quantity control: Square's `−  N  +`, and the in-place
 * `Remove this item?  Keep · Remove` row that `−` at 1 swaps in (never a modal
 * over the work).
 *
 * Extracted from `KioskCartLineCard` so the repair flow's Device & quote cards
 * count units with the cart's control rather than a "Remove this device"
 * button of their own (operator 2026-09-24: "it should be like a inline edit
 * display same as the cart for adding multiple … minusing … removing").
 *
 * Presses stay here: a click must not open a card's editor, Enter must not
 * reach a card's key handler, and a press must not start a swipe row's drag.
 *
 * Callers: `KioskCartLineCard`, `KioskRepairPane`. Affected API: none.
 */

import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';

function keepPressHere(event: MouseEvent | KeyboardEvent | PointerEvent): void {
  event.stopPropagation();
}

export function KioskQuantityStepper({
  title,
  quantity,
  onStep,
  canRemove,
  testIdPrefix,
}: {
  /** What is being counted — names the keys for a screen reader. */
  title: string;
  quantity: number;
  /** `+1` / `-1`. The caller decides what `-1` at 1 means (see `stepCartQuantity`). */
  onStep: (delta: 1 | -1) => void;
  /** False: `−` stops at 1 (a desk-held mirror may not remove). */
  canRemove: boolean;
  /** `<prefix>-stepper` / `-minus` / `-qty` / `-plus`. */
  testIdPrefix: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Quantity of ${title}`}
      className="flex items-center gap-1"
      onClick={keepPressHere}
      onKeyDown={keepPressHere}
      onPointerDown={keepPressHere}
      data-testid={`${testIdPrefix}-stepper`}
    >
      <IconButton
        size="touch"
        radius="pill"
        className="border border-border-hairline"
        icon={<Minus className="h-5 w-5" />}
        ariaLabel={quantity <= 1 ? `Remove ${title}` : `One fewer ${title}`}
        disabled={quantity <= 1 && !canRemove}
        onClick={() => onStep(-1)}
        data-testid={`${testIdPrefix}-minus`}
      />
      <span
        className="min-w-8 text-center text-base font-semibold tabular-nums text-text-default"
        aria-live="polite"
        data-testid={`${testIdPrefix}-qty`}
      >
        {quantity}
      </span>
      <IconButton
        size="touch"
        radius="pill"
        className="border border-border-hairline"
        icon={<Plus className="h-5 w-5" />}
        ariaLabel={`One more ${title}`}
        onClick={() => onStep(1)}
        data-testid={`${testIdPrefix}-plus`}
      />
    </div>
  );
}

/** The row `−` at 1 swaps in, in place of the row that held the stepper. */
export function KioskRemoveConfirm({
  onKeep,
  onRemove,
  testIdPrefix,
}: {
  onKeep: () => void;
  onRemove: () => void;
  /** `<prefix>-remove-confirm` / `-keep` / `-remove`. */
  testIdPrefix: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      onClick={keepPressHere}
      onKeyDown={keepPressHere}
      onPointerDown={keepPressHere}
      data-testid={`${testIdPrefix}-remove-confirm`}
    >
      <span className="text-sm font-semibold text-text-default">Remove this item?</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="lg" onClick={onKeep} data-testid={`${testIdPrefix}-keep`}>
          Keep
        </Button>
        <Button variant="danger" size="lg" onClick={onRemove} data-testid={`${testIdPrefix}-remove`}>
          Remove
        </Button>
      </div>
    </div>
  );
}
