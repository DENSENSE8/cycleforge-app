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
 *   plane painting {@link GridClickSelectFace}. Body rows on Unbox History /
 *   Incoming mount that face decoratively (the row owns toggle).
 * - `'flush'` (the COMPOUND row): the same full-cell face, edge to edge in a
 *   48px square gutter, with a FADED check when unselected so the column reads
 *   as a checkmark column at rest. See `CompoundSelect`.
 */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * How the select-gutter face is painted.
 *
 * `'flush'` is the COMPOUND row's face and is deliberately not selectable at a
 * mount: `CompoundSelect` hardcodes it, because the compound row has one
 * display method by rule. The other three serve the flat spreadsheets, whose
 * 16px checklist square is a different (and still correct) answer for a 28px
 * row.
 */
export type GridSelectGutterChrome = 'always' | 'selected-only' | 'sheets' | 'flush';

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
 * The select-track FACE — full-bleed, and never blank.
 *
 * Fills its track flush: accent wash + white check when on, a quiet wash + dash
 * when mixed, and a FADED check when off.
 *
 * ## Why "off" is a faded check rather than nothing
 *
 * This painted nothing when unchecked until 2026-08-21, which made the leftmost
 * column of a grid indistinguishable from an empty gutter. On Incoming — where
 * every body row uses this face — the column read as dead space: an operator
 * could not tell it was a selection column at all, let alone scan down it to
 * see what was ticked. "Nothing" is also ambiguous in the one way that matters
 * on a floor: it cannot be told apart from "not loaded" or "not selectable".
 *
 * A faded check answers all three at once. It says *this column is a checkmark
 * column*, it says *this row is not selected*, and the contrast step to the
 * filled state is large enough to read down a 40-row list at a glance without
 * putting a saturated colour on every row.
 *
 * Callers mount this inside a `relative overflow-hidden` track cell and pass
 * `absolute inset-0` so the wash cannot inflate the grid track or bleed into
 * the next column under sticky scroll (in-flow `w-full` + `overflow:visible`
 * was painting a wash strip into Platform).
 *
 * Also composed inside {@link GridRowCheckbox} `chrome="sheets"` for header
 * select-all, so the top-left control carries the same three states.
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
            : // Off: no wash — the row's own fill shows through, so selection
              // stays the only thing that paints a band down the column.
              'text-text-faint/60',
        className,
      )}
      aria-hidden
      data-click-select-face={isOn ? 'on' : isMixed ? 'mixed' : 'off'}
    >
      {isMixed ? (
        <span className="h-0.5 w-2.5 rounded-full bg-current" />
      ) : (
        // The SAME glyph at both weights. A different shape for off would make
        // the operator decode two symbols; only the ink changes.
        <Check className="h-3.5 w-3.5" />
      )}
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
  disabled = false,
}: {
  checked: boolean | 'mixed';
  onToggle: () => void;
  /** Accessible name — say what toggling does, e.g. "Select carton 123". */
  label: string;
  className?: string;
  /** Defaults to `'always'`. Unbox History / Incoming click-select use `'sheets'`. */
  chrome?: GridSelectGutterChrome;
  /**
   * Greys the control and blocks the toggle. Tasks needs it — an archived task
   * cannot be checked off, and an in-flight toggle must not be double-fired —
   * and a disabled REAL control is the honest form: it stays in the a11y tree
   * announcing why it cannot be used, where omitting it would silently drop the
   * column's affordance on exactly the rows that most need explaining.
   */
  disabled?: boolean;
}) {
  const isMixed = checked === 'mixed';
  const isOn = checked === true;
  // Both paint the same full-cell face; `'flush'` is the compound row's 48px
  // square, `'sheets'` the flat grids' select-all.
  const fullBleedFace = chrome === 'sheets' || chrome === 'flush';
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
      //
      // A natively-disabled button fires no click at all, so this handler simply
      // does not run when `disabled` — no guard needed, and none pretended. The
      // cell wrapper is what keeps a click on the surrounding plane off the row.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      // `dblclick` is a SEPARATE event from `click` — stopping the latter does
      // nothing for it. Rows bind dblclick to "open the record", so two quick
      // ticks used to toggle twice AND open. Latent while the target was a 16px
      // square; reachable now that the hit plane is the whole 48px cell and the
      // control tells operators they never have to aim.
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        // ds-raw-button: gutter check — DS Button has no glyph-square variant.
        // Full-track hit plane for every chrome — the 16px square is the face,
        // not the only clickable pixels.
        'ds-raw-button flex h-full w-full shrink-0 items-center justify-center self-stretch rounded-none border-0 bg-transparent',
        fullBleedFace && 'relative overflow-hidden',
        disabled && 'cursor-not-allowed opacity-50',
        // A full-bleed face fills its cell exactly and the cell clips, so an
        // OFFSET ring (what `'control'` paints) lands outside the border box and
        // is scissored away — the keyboard user gets no focus indicator at all.
        // `'cell'` is the inset ring the focus-ring SoT documents for precisely
        // this: "an offset ring would paint outside the cell and be clipped".
        focusRing(fullBleedFace ? 'cell' : 'control'),
        className,
      )}
    >
      {fullBleedFace ? (
        <GridClickSelectFace checked={checked} className="absolute inset-0" />
      ) : selectedOnly ? (
        isOn || isMixed ? checklistFace : null
      ) : (
        checklistFace
      )}
    </button>
  );
}
