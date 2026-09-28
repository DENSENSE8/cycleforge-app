'use client';

import { cn } from '@/utils/_cn';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import type { TimelineTone } from '@/lib/timeline/types';

/** ReasonChipPicker — the house single-select picker for a **reason vocabulary** (`reason_codes` / a system reason registry). */

const TONE_CHIP: Record<TimelineTone, { base: string; selected: string }> = {
  info: { base: 'bg-blue-50 text-blue-700 ring-blue-200', selected: 'bg-blue-100 ring-blue-400' },
  warning: { base: 'bg-amber-50 text-amber-700 ring-amber-200', selected: 'bg-amber-100 ring-amber-400' },
  danger: { base: 'bg-rose-50 text-rose-700 ring-rose-200', selected: 'bg-rose-100 ring-rose-400' },
  success: { base: 'bg-emerald-50 text-emerald-700 ring-emerald-200', selected: 'bg-emerald-100 ring-emerald-400' },
  fulfillment: {
    base: `${STATE_TONE_CLASSES.fulfillment.pill} ${STATE_TONE_CLASSES.fulfillment.ring}`,
    // Selected keeps the /10 ground (text stays ≥ 4.5:1) and strengthens the ring.
    selected: 'ring-fill-fulfillment',
  },
  muted: { base: 'bg-surface-canvas text-text-muted ring-border-soft', selected: 'bg-surface-sunken ring-border-emphasis' },
  default: { base: 'bg-surface-canvas text-text-muted ring-border-soft', selected: 'bg-surface-sunken ring-border-emphasis' },
};

/** One option in a reason vocabulary. */
interface ReasonChipOption {
  code: string;
  label: string;
  tone: TimelineTone;
}

interface ReasonChipPickerProps {
  /** Selected code, or null while the operator hasn't chosen. */
  value: string | null;
  onChange: (code: string) => void;
  options: readonly ReasonChipOption[];
  /** Names the radiogroup for screen readers, e.g. "Substitution reason". */
  ariaLabel: string;
  /** Bigger tap targets for a station/phone floor surface. */
  size?: 'sm' | 'touch';
  className?: string;
}

export function ReasonChipPicker({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'sm',
  className,
}: ReasonChipPickerProps) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const tone = TONE_CHIP[option.tone] ?? TONE_CHIP.default;
        const selected = value === option.code;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`reason-${option.code}`}
            onClick={() => onChange(option.code)}
            className={cn(
              'ds-raw-button',
              'rounded-full ring-1 ring-inset transition-colors',
              size === 'touch'
                ? 'min-h-11 px-3.5 py-2 text-role-caption font-semibold'
                : 'px-2.5 py-1 text-role-micro',
              tone.base,
              selected ? cn(tone.selected, 'ring-2') : 'opacity-80 hover:opacity-100',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
