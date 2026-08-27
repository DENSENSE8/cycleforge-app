'use client';

import { cn } from '@/utils/_cn';
import type { TimelineTone } from '@/lib/timeline/types';

/**
 * ReasonChipPicker — the house single-select picker for a **reason vocabulary**
 * (`reason_codes` / a system reason registry).
 *
 * Promoted out of `SubstituteReasonPicker`, which was the only consumer until
 * the receiving photo-policy waiver needed the identical job: pick exactly one
 * code from a small, closed, tone-carrying vocabulary. Two vocabularies is the
 * moment to share the primitive rather than copy the markup
 * (`AGENTS.md` → promote, then compose). `SubstituteReasonPicker` is now a thin
 * wrapper that supplies `SUBSTITUTION_REASONS`; its public API is unchanged.
 *
 * Contract:
 * - **Controlled, and never auto-selects.** `value: null` is a legitimate
 *   resting state and the caller keeps its confirm action disabled until the
 *   operator picks. A pre-selected reason is not a reason — it is a default the
 *   operator never read, which is exactly wrong for a code that justifies an
 *   override.
 * - **Codes in, code out.** No free-text sibling field: if a vocabulary needs
 *   "other, explain", that belongs in the vocabulary as a code, not a textarea.
 * - Chip tones resolve through the house 3-layer chip recipe
 *   (`bg-x-50` / `text-x-700` / `ring-x-200`, `ui-design-system.md`) from a
 *   `TimelineTone`; callers pass a semantic tone, never a class string.
 */

const TONE_CHIP: Record<TimelineTone, { base: string; selected: string }> = {
  info: { base: 'bg-blue-50 text-blue-700 ring-blue-200', selected: 'bg-blue-100 ring-blue-400' },
  warning: { base: 'bg-amber-50 text-amber-700 ring-amber-200', selected: 'bg-amber-100 ring-amber-400' },
  danger: { base: 'bg-rose-50 text-rose-700 ring-rose-200', selected: 'bg-rose-100 ring-rose-400' },
  success: { base: 'bg-emerald-50 text-emerald-700 ring-emerald-200', selected: 'bg-emerald-100 ring-emerald-400' },
  muted: { base: 'bg-surface-canvas text-text-muted ring-border-soft', selected: 'bg-surface-sunken ring-border-emphasis' },
  default: { base: 'bg-surface-canvas text-text-muted ring-border-soft', selected: 'bg-surface-sunken ring-border-emphasis' },
};

/**
 * One option in a reason vocabulary. Structurally satisfied by
 * `SubstitutionReason` and by `PhotoPolicyOverrideOption` — callers pass their
 * own row shape and structural typing does the rest, so this stays module-local
 * (an exported alias nobody imports is just dead surface area).
 */
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
                : 'px-2.5 py-1 text-role-micro uppercase tracking-widest',
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
