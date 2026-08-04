'use client';

/**
 * The select-gutter control for LedgerGrid row families (Incoming / Receiving
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
 * ## Chrome
 *
 * - `'always'` (default): the 16px bordered square is always painted
 *   (checklist face — deliberately NOT the Radix `Checkbox` primitive).
 * - `'selected-only'`: legacy pilot — full-cell hit plane, blank until
 *   checked/mixed; then the same 16px accent face. Kept until callers migrate.
 * - `'sheets'` (Unbox History golden): full-cell hit plane, **zero painted
 *   face** in every state. Selection signal is the row wash
 *   (`ledgerRowFillClass`), not a checklist icon in the gutter.
 */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** How the select-gutter face (or lack of one) is painted. */
export type GridSelectGutterChrome = 'always' | 'selected-only' | 'sheets';

/** Full-cell stretch hit-plane (Sheets / selected-only) vs centered face (`always`). */
export function isEmptyGutterChrome(chrome: GridSelectGutterChrome): boolean {
  return chrome !== 'always';
}

function faceClassName(isOn: boolean, isMixed: boolean): string {
  return cn(
    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
    isOn
      ? 'border-accent-bg bg-accent-bg text-text-inverse'
      : isMixed
        ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
        : 'border-border-default bg-surface-card hover:border-border-strong',
  );
}

export function GridRowCheckbox({
  /** `'mixed'` = a PO group with some (not all) children checked. */
  checked,
  onToggle,
  label,
  className,
  chrome = 'always',
}: {
  checked: boolean | 'mixed';
  onToggle: () => void;
  /** Accessible name — say what toggling does, e.g. "Select carton 123". */
  label: string;
  className?: string;
  /** Defaults to `'always'`. Unbox History uses `'sheets'`. */
  chrome?: GridSelectGutterChrome;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  const emptyGutter = isEmptyGutterChrome(chrome);
  const washOnly = chrome === 'sheets';

  const face = (
    <>
      {isOn ? (
        <Check className="h-3 w-3" />
      ) : isMixed ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : null}
    </>
  );

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isMixed ? 'mixed' : isOn}
      aria-label={label}
      data-select-chrome={chrome}
      // The row underneath opens the record — a check must never do both.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      className={cn(
        // ds-raw-button: gutter check — DS Button has no glyph-square variant
        'ds-raw-button flex shrink-0 items-center justify-center',
        emptyGutter
          ? 'h-full min-h-10 w-full self-stretch rounded-none border-0 bg-transparent'
          : faceClassName(isOn, isMixed),
        focusRing('control'),
        className,
      )}
    >
      {washOnly ? null : emptyGutter ? (
        isOn || isMixed ? (
          <span className={faceClassName(isOn, isMixed)} aria-hidden>
            {face}
          </span>
        ) : null
      ) : (
        face
      )}
    </button>
  );
}
