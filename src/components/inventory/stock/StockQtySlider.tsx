'use client';

/**
 * A stock quantity, set by hand or by slide: − · the house `StopSlider` (one
 * stop per unit) · + · the number itself (type any amount, even past the
 * slider's end — the slider then stretches to it). Every stock count on the
 * Stock record uses it (a tote's count, Add location's qty; owner
 * 2026-09-30: "an incremental slider for UX friendliness").
 */

import { useMemo } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { EVIDENCE_CONTROL_CLASS, evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { StopSlider } from '@/design-system/primitives/StopSlider';
import { cn } from '@/utils/_cn';

/** The slider's reach: comfortably past what is there now, never a sliver. */
function sliderMax(value: number, anchor: number): number {
  return Math.max(10, anchor * 2, anchor + 10, value);
}

export function StockQtySlider({
  value,
  onChange,
  min = 0,
  anchor,
  ariaLabel,
  disabled = false,
  testId,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Lowest settable amount (0 for a count, 1 for an add). */
  min?: number;
  /** What the slider is scaled around — the count now (or the default add). */
  anchor: number;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}) {
  const max = sliderMax(value, anchor);
  const stops = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const set = (next: number) => onChange(Math.max(min, Math.round(next)));
  const stepClass = cn(evidenceVerbClass(false), 'w-8 shrink-0 px-0');

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5" data-testid={testId}>
      <button type="button" aria-label={`${ariaLabel}: one less`} className={stepClass} disabled={disabled || value <= min} onClick={() => set(value - 1)}>
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <StopSlider
        stops={stops}
        value={value}
        onChange={set}
        ariaLabel={ariaLabel}
        showStops={false}
        disabled={disabled}
        className="min-w-24 flex-1"
        data-testid={testId ? `${testId}-range` : undefined}
      />
      <button type="button" aria-label={`${ariaLabel}: one more`} className={stepClass} disabled={disabled} onClick={() => set(value + 1)}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        value={String(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          set(digits === '' ? min : Number(digits));
        }}
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(EVIDENCE_CONTROL_CLASS, 'w-14 shrink-0 text-center tabular-nums')}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    </div>
  );
}
