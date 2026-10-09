'use client';

/**
 * The tote number pad: the `H-…` readout over {@link MobileDigitPad}. House tote plates are `H-{id}`;
 * the host owns what the tote is for (park it, load it, pair a SKU to its shelf) and says so in
 * `caption`.
 */

import { Package } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { MobileDigitPad } from './MobileDigitPad';

/** Ids past six digits are not on any label. */
export const TOTE_DIGITS_MAX = 6;

export function ToteNumberPad({
  digits,
  onChange,
  toteCode,
  caption,
  captionAlert = false,
  disabled = false,
  testId,
}: {
  digits: string;
  onChange: (digits: string) => void;
  /** The matched open tote's code; null while no tote matches. */
  toteCode: string | null;
  /** Under the number: where the tote is, or why none matches. */
  caption: string;
  captionAlert?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <>
      <div className="flex min-h-14 items-center gap-3 border-t border-mode-rule bg-mode-panel px-4 py-2" aria-live="polite" data-testid={testId}>
        <Package className={cn('h-6 w-6 shrink-0', toteCode ? 'text-emerald-600' : 'text-text-faint')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block font-mono text-role-title font-semibold tabular-nums', toteCode ? 'text-text-default' : 'text-text-muted')}>
            {toteCode ?? (digits ? `H-${digits}` : 'H-')}
          </span>
          <span className={cn('block text-role-micro', captionAlert ? 'font-semibold text-text-danger' : 'text-text-muted')}>{caption}</span>
        </span>
      </div>
      <MobileDigitPad value={digits} maxLength={TOTE_DIGITS_MAX} label="Tote number" disabled={disabled} onChange={onChange} />
    </>
  );
}
