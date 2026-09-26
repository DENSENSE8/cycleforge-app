'use client';

/** The select-gutter control for LedgerGrid row families (Incoming / Receiving leaf rows + their PO group summaries) and the mobile stacked… */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** How the select-gutter face is painted. */
export type GridSelectGutterChrome = 'always' | 'selected-only' | 'hover' | 'sheets' | 'flush';

/**
 * Every chrome fills the select track as the hit plane; only the painted face
 * differs. Callers stretch the host cell (`items-stretch p-0`) when true.
 */
export function isEmptyGutterChrome(_chrome: GridSelectGutterChrome): boolean {
  return true;
}

/**
 * The 16px square face — the one the header select-all paints.
 * was the one that did not look like a checkbox. Operator 2026-09-04: it should
 */
function faceClassName(isOn: boolean, isMixed: boolean): string {
  return cn(
    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
    isOn
      ? 'border-accent-bg bg-accent-bg text-text-inverse'
      : isMixed
        ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
        : 'border-border-default bg-surface-card hover:border-border-strong',
  );
}

/** The COMPOUND row's body face: */
export function GridSelectSquareFace({
  checked,
  className,
}: {
  checked: boolean | 'mixed';
  className?: string;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
        isOn
          ? 'border-accent-bg bg-accent-bg text-text-inverse'
          : isMixed
            ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
            : cn(
                // At rest on a hover pointer: NOTHING. No box, no mark.
                'border-transparent bg-transparent',
                // The ROW's hover brings the empty box out. `group/row` is
                // declared by `ledgerGridRowShellClass`, so every LedgerGrid row
                // carries it and no family has to remember.
                'group-hover/row:border-border-default group-hover/row:bg-surface-card',
                // …and the HEADER row's hover does the same for select-all, whose shell declares `group/hrow` instead (`LedgerGridColumnHeader`).
                // operator 2026-09-04, "the selection top left select all must
                'group-hover/hrow:border-border-default group-hover/hrow:bg-surface-card',
                // Keyboard: the checkbox button is `group/select`. Empty box
                // only — still no faded check.
                'group-focus-visible/select:border-border-default group-focus-visible/select:bg-surface-card',
                // Touch / pen: there is no hover to hunt. Empty box standing,
                // still no faded check.
                '[@media(hover:none)]:border-border-default [@media(hover:none)]:bg-surface-card',
              ),
        className,
      )}
      aria-hidden
      data-select-square-face={isOn ? 'on' : isMixed ? 'mixed' : 'off'}
    >
      {isOn ? (
        <Check className="h-3 w-3" />
      ) : isMixed ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : // OFF paints no glyph at all — see the docblock.
      null}
    </span>
  );
}

export const GridClickSelectFace = GridSelectSquareFace;


export function GridRowCheckbox({
  /** `'mixed'` = a PO group with some (not all) children checked. */
  checked,
  onToggle,
  label,
  className,
  chrome = 'always',
  disabled = false,
}: {
  checked: boolean | 'mixed';
  /** Toggle this row. */
  onToggle: (event: { shiftKey: boolean }) => void;
  /** Accessible name — say what toggling does, e.g. "Select carton 123". */
  label: string;
  className?: string;
  /** Defaults to `'always'`. Unbox History / Incoming click-select use `'sheets'`. */
  chrome?: GridSelectGutterChrome;
  /** Greys the control and blocks the toggle. */
  disabled?: boolean;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  // `'hover'` paints a 16px square but fills a CLIPPING cell, so it needs the
  // inset focus ring (see the `focusRing` call below).
  const hoverSquare = chrome === 'hover';
  const selectedOnly = chrome === 'selected-only';

  const face = (
    <>
      {isOn ? (
        <Check className="h-3 w-3" />
      ) : isMixed ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : null}
    </>
  );

  const checklistFace = (
    <span className={faceClassName(isOn, isMixed)} aria-hidden>
      {face}
    </span>
  );

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isMixed ? 'mixed' : isOn}
      aria-label={label}
      data-select-chrome={chrome}
      disabled={disabled}
      // The row underneath opens the record — a check must never do both.
      onClick={(event) => {
        event.stopPropagation();
        onToggle({ shiftKey: event.shiftKey });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      // `dblclick` is a SEPARATE event from `click` — stopping the latter does nothing for it.
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        // ds-raw-button:
        // Face sits at the TOP of each row cell (operator 2026-09-04: "most
        'ds-raw-button group/select flex h-full w-full shrink-0 items-start justify-center self-stretch rounded-none border-0 bg-transparent pt-1',
        disabled && 'cursor-not-allowed opacity-50',
        // A full-bleed face fills its cell exactly and the cell clips, so an OFFSET ring (what `'control'` paints) lands outside the border box…
        focusRing(hoverSquare ? 'cell' : 'control'),
        className,
      )}
    >
      {hoverSquare ? (
        <GridSelectSquareFace checked={checked} />
      ) : selectedOnly ? (
        isOn || isMixed ? checklistFace : null
      ) : (
        checklistFace
      )}
    </button>
  );
}
