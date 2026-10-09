'use client';

/**
 * The phone's 3×4 number pad — 1–9, clear, 0, backspace — as flush cells
 * under the thumb. It edits a digit string; what the digits mean (a count, a
 * tote number) is the host's. One pad for every keyed number on `/m/*`.
 */

import { X } from '@/components/Icons';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from '@/design-system/components/MobileDataListRow';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';

const KEYS: ReadonlyArray<string | number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'back'];

/** Flush keypad / toggle cell: square, no gap, no scale. */
export const DIGIT_PAD_CELL = 'h-auto w-full justify-center shadow-none ring-0 enabled:active:scale-100';

/**
 * Press for a neutral cell: the house quiet wash (owner 2026-10-05: never a
 * black flash). A chosen cell with its own fill variant keeps that variant's
 * hover and press instead.
 */
export const DIGIT_PAD_QUIET_CELL = cn(DIGIT_PAD_CELL, MOBILE_DATA_LIST_ROW_INTERACTION_CLASS);

export function MobileDigitPad({
  value,
  onChange,
  maxLength,
  disabled = false,
  label = 'Number pad',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Digits beyond this are ignored. */
  maxLength: number;
  disabled?: boolean;
  label?: string;
}) {
  const press = (key: string | number) => {
    if (key === 'clear') onChange('');
    else if (key === 'back') onChange(value.slice(0, -1));
    else {
      // Leading zeros carry no meaning in a count or an id.
      const next = `${value}${key}`.replace(/^0+(?=\d)/, '');
      if (next.length <= maxLength) onChange(next);
    }
  };
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-px border-t border-mode-rule bg-mode-rule">
      {KEYS.map((key) => (
        <Button
          key={String(key)}
          variant="secondary"
          radius="flush"
          ariaLabel={key === 'clear' ? 'Clear' : key === 'back' ? 'Delete digit' : `digit ${key}`}
          disabled={disabled}
          onClick={() => press(key)}
          className={cn(
            DIGIT_PAD_QUIET_CELL,
            'min-h-16 font-mono text-2xl',
            key === 'clear' || key === 'back' ? 'bg-mode-well text-mode-muted' : 'bg-mode-panel text-mode-ink',
          )}
        >
          {key === 'clear' ? <X className="h-5 w-5" /> : key === 'back' ? '⌫' : String(key)}
        </Button>
      ))}
    </div>
  );
}
