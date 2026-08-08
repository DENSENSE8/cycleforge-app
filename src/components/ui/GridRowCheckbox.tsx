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
 *   (checklist face — deliberately NOT the Radix `Checkbox` primitive). The
 *   **hit plane is the full select track** — operators need not aim at the
 *   square; any click in the first column toggles.
 * - `'selected-only'`: legacy pilot — full-cell hit plane, blank until
 *   checked/mixed; then the same 16px accent face. Kept until callers migrate.
 * - `'sheets'` (header select-all on click-select surfaces): full-cell hit
 *   plane; paints {@link GridClickSelectFace} when checked / mixed (flush
 *   accent wash + check). Blank while unchecked. Body rows on Unbox History /
 *   Incoming mount decorative {@link GridClickSelectFace} separately (row owns
 *   toggle). To-ship Orders uses `'always'` on header **and** body so every
 *   leftmost cell is a real checklist square with a full-cell hit plane.
 */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** How the select-gutter face (or lack of one) is painted. */
export type GridSelectGutterChrome = 'always' | 'selected-only' | 'sheets';

/**
 * Every chrome fills the select track as the hit plane; only the painted face
 * differs. Callers stretch the host cell (`items-stretch p-0`) when true.
 */
export function isEmptyGutterChrome(_chrome: GridSelectGutterChrome): boolean {
  return true;
}

function faceClassName(isOn: boolean, isMixed: boolean): string {
  return cn(
    'flex h-4 w-4 shrink-0 items-center justify-center rounded-none border transition-colors',
    isOn
      ? 'border-accent-bg bg-accent-bg text-text-inverse'
      : isMixed
        ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
        : 'border-border-default bg-surface-card hover:border-border-strong',
  );
}

/**
 * Decorative select-track face for click-select surfaces (Unbox History /
 * Incoming Pipeline). The row owns bulk toggle (`role="checkbox"`); this
 * paints membership only — never a second interactive control.
 *
 * Fills the frozen select track (`2rem` × row `h-10`) flush — full-cell
 * accent wash + centered glyph when checked / mixed; blank when unchecked.
 * No inset 16px checklist square (that face belongs to interactive
 * `'always'` gutter chrome only).
 *
 * Callers mount this inside a `relative overflow-hidden` track cell and pass
 * `absolute inset-0` so the wash cannot inflate the grid track or bleed into
 * the next column under sticky scroll (in-flow `w-full` + `overflow:visible`
 * was painting a wash strip into Platform).
 *
 * Also composed inside {@link GridRowCheckbox} `chrome="sheets"` for header
 * select-all so the top-left control shows the same check when all/mixed.
 */
export function GridClickSelectFace({
  checked,
  className,
}: {
  checked: boolean | 'mixed';
  className?: string;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        isOn
          ? 'bg-accent-bg text-text-inverse'
          : isMixed
            ? 'bg-accent-bg/20 text-accent-bg'
            : null,
        className,
      )}
      aria-hidden
      data-click-select-face={isOn ? 'on' : isMixed ? 'mixed' : 'off'}
    >
      {isOn ? (
        <Check className="h-3.5 w-3.5" />
      ) : isMixed ? (
        <span className="h-0.5 w-2.5 rounded-full bg-current" />
      ) : null}
    </div>
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
  /** Defaults to `'always'`. Unbox History / Incoming click-select use `'sheets'`. */
  chrome?: GridSelectGutterChrome;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  const sheetsChrome = chrome === 'sheets';
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
      // The row underneath opens the record — a check must never do both.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      className={cn(
        // ds-raw-button: gutter check — DS Button has no glyph-square variant.
        // Full-track hit plane for every chrome — the 16px square is the face,
        // not the only clickable pixels.
        'ds-raw-button flex h-full w-full shrink-0 items-center justify-center self-stretch rounded-none border-0 bg-transparent',
        sheetsChrome && 'relative overflow-hidden',
        focusRing('control'),
        className,
      )}
    >
      {sheetsChrome ? (
        <GridClickSelectFace checked={checked} className="absolute inset-0" />
      ) : selectedOnly ? (
        isOn || isMixed ? checklistFace : null
      ) : (
        checklistFace
      )}
    </button>
  );
}
