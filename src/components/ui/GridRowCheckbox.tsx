'use client';

/**
 * The select-gutter checkbox for LedgerGrid row families (Incoming / Receiving
 * leaf rows + their PO group summaries) and the mobile stacked row.
 *
 * **It is a real button, not a painted span.** The multi-select plane is
 * reached by clicking THIS control; a plain row click belongs to the record
 * plane (open the inspector) — `display/workbench.md` → Action planes. An inert
 * span inside a row whose own click toggled membership is what made
 * `/incoming`'s inspector unreachable: the row carried `role="checkbox"` and
 * never dispatched `receiving-select-line`, so `IncomingDetailsPanel` could not
 * mount at all. Same defect `OrdersQueueTableRow` fixed on the outbound grid.
 *
 * The visual is the established grid-gutter square (16px, accent fill when
 * checked, dash when mixed) — deliberately NOT the Radix `Checkbox` primitive,
 * whose shadowed `rounded-sm` face would disagree with the group-summary
 * checkbox sitting one row above it.
 */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function GridRowCheckbox({
  /** `'mixed'` = a PO group with some (not all) children checked. */
  checked,
  onToggle,
  label,
  className,
}: {
  checked: boolean | 'mixed';
  onToggle: () => void;
  /** Accessible name — say what toggling does, e.g. "Select carton 123". */
  label: string;
  className?: string;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isMixed ? 'mixed' : isOn}
      aria-label={label}
      // The row underneath opens the record — a check must never do both.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      className={cn(
        // ds-raw-button: 16px gutter check — DS Button has no glyph-square variant
        'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        isOn
          ? 'border-accent-bg bg-accent-bg text-text-inverse'
          : isMixed
            ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
            : 'border-border-default bg-surface-card hover:border-border-strong',
        focusRing('control'),
        className,
      )}
    >
      {isOn ? (
        <Check className="h-3 w-3" />
      ) : isMixed ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : null}
    </button>
  );
}
