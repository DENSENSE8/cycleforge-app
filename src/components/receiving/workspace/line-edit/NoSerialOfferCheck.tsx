'use client';

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * The green-check "no serial" OFFER button.
 *
 * One button, two callers, because they are the same affordance at two
 * cardinalities: the single-qty serial row (`SerialCard`) and the multi-qty
 * unit list's all-units slot (`NoSerialControl` `variant="check"`). It used to
 * exist only as bespoke markup inside `SerialCard`, so the multi-qty side had
 * grown a dashed grey token instead — the two read as different features when
 * they are one, and an operator moving between a 1-of and a 3-of had to learn
 * the control twice.
 *
 * **Sits in the trailing action column**, so it must match the height of the
 * add/submit button it replaces (`h-11`) — a shorter control makes the row look
 * misaligned and reads as disabled chrome rather than something to press.
 * `width` picks which column it is standing in: `w-14` beside a single-qty
 * input, `w-11` in the multi-qty unit list where the per-row buttons are square.
 *
 * `appearance="flush"` joins a host scan bar (`rounded-none`, no own outer
 * gap/radius — the bar owns the shared hairline).
 */
export function NoSerialOfferCheck({
  onClick,
  label,
  disabled = false,
  required = false,
  width = 'w-14',
  appearance = 'default',
}: {
  onClick: () => void;
  /** Tooltip + aria-label. Says what the waiver covers (this item vs all units). */
  label: string;
  disabled?: boolean;
  /** Org enforces the checkpoint — read as a required gate (amber), not an offer. */
  required?: boolean;
  /** Trailing-column width: `w-14` single-qty, `w-11` multi-qty unit rows. */
  width?: 'w-11' | 'w-14';
  /** `flush` = joined scan-bar cell (square, abuts the SERIAL field). */
  appearance?: 'default' | 'flush';
}) {
  const flush = appearance === 'flush';
  return (
    <HoverTooltip label={required ? `Required — ${label}` : label} asChild>
      {/* ds-raw-button: green-check no-serial offer toggle, not a DS Button */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={false}
        className={cn(
          'inline-flex h-11 shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          flush
            ? cornerClass('flush')
            : cn(cornerClass('field'), 'border shadow-sm'),
          width,
          required
            ? flush
              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              : 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
            : flush
              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="h-5 w-5"
        >
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </HoverTooltip>
  );
}
