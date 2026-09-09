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
 * Every chrome fills the select track as the HIT PLANE — operators never aim at
 * the 16px face. Only the painted mark differs.
 *
 * - `'always'` (default): the bordered square is always painted. Headers
 *   (select-all) and the flat spreadsheets.
 * - `'hover'` (the COMPOUND row BODY): the same square, painted when the ROW
 *   is hovered, when this control is `:focus-visible`, on `@media (hover: none)`,
 *   or when the box is checked/mixed. Never a faded check at rest. See
 *   {@link GridSelectSquareFace}.
 * - `'selected-only'`: legacy pilot — blank until checked/mixed, then the same
 *   square. Kept until callers migrate.
 *
 * `'sheets'` and `'flush'` were removed on 2026-09-04 along with the
 * `GridClickSelectFace` they painted — a wash across the whole 48px cell, with
 * a faded check when off. Both states were retired by the operator in the same
 * pass (no full-bleed face; no resting checkmark), which left the variants with
 * nothing to paint and one caller between them.
 */

import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * How the select-gutter face is painted.
 *
 * `'hover'` is the COMPOUND leaf's face (`CompoundSelect` defaults to it).
 * Pointer desks still hide the empty box until row hover; keyboard and
 * touch get the empty square without a faded check. Order-group parent
 * chrome may pass `'always'` so the fold checkbox is visible without a hunt.
 */
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
 *
 * `rounded-sm` is not a taste call and not a new literal: it is the corner the
 * house's own selection control already carries
 * (`@/design-system/primitives/Checkbox`, `h-4 w-4 … rounded-sm border`). This
 * face was square while every other checkbox in the product was not, so the
 * most prominent selection control on the floor — top-left of every desk grid —
 * was the one that did not look like a checkbox. Operator 2026-09-04: it should
 * look like a default selection button.
 *
 * The industrial flush-square ladder still governs SURFACES (cells, panes,
 * wells). A 16px control is not a surface, and matching the primitive is the
 * opposite of forking from it.
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

/**
 * The COMPOUND row's body face: the same 16px rounded square the header paints,
 * revealed by row hover, keyboard focus, or a device with no hover.
 *
 * ## Three states, and "off" is empty
 *
 * - **checked / mixed** — accent square, always painted. Membership must be
 *   readable down the column without hovering anything.
 * - **off + row hovered / `:focus-visible` on this control / no-hover pointer**
 *   — an empty bordered square: the control, no mark inside.
 * - **off + at rest on a hover pointer** — nothing.
 *
 * ## Why (2026-09-04)
 *
 * This gutter painted a full-bleed {@link GridRowCheckbox} face across the whole
 * 48px cell — an accent block on every checked row, and a 48px-tall FADED CHECK
 * on every other one. The operator retired both in one pass: show the checkmark
 * selection on row hover, "not a full width or full height display", and
 * "remove the faded checkmark throughout the entire slot data table".
 *
 * That reverses the 2026-08-21 ruling ("nothing" cannot be told apart from "not
 * loaded" or "not selectable", so paint a faded check at rest). It is a
 * deliberate reversal, not a regression: the argument for the resting mark was
 * that an operator could not tell the leftmost column was selectable, and
 * hover-reveal answers that at the moment the question is actually being asked
 * — while a column of forty grey checks answers it forty times, permanently,
 * over the data. Do not restore the resting glyph without a new instruction.
 * Keyboard focus and `@media (hover: none)` paint the same EMPTY box so the
 * column is still findable without a faded check.
 *
 * ## What did NOT change
 *
 * **The hit plane is still the entire cell.** {@link GridRowCheckbox} is
 * `h-full w-full` for every chrome, so operators never aim at the 16px box —
 * that was an explicit part of the same instruction.
 */
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
                // …and the HEADER row's hover does the same for select-all,
                // whose shell declares `group/hrow` instead
                // (`LedgerGridColumnHeader`). One face, both positions:
                // operator 2026-09-04, "the selection top left select all must
                // be on hover as well".
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
  /**
   * Toggle this row. Receives the click's MODIFIER STATE so a range select can
   * reach the selection model.
   *
   * It used to be `() => void`, which swallowed the event — so every caller
   * that wanted shift-click had to hard-code `{ shiftKey: false }` and the
   * range gesture was plumbed all the way down to `useTableSelectMode` and then
   * never reachable. A zero-arg handler stays assignable, so callers that do
   * not care are unchanged.
   */
  onToggle: (event: { shiftKey: boolean }) => void;
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
      //
      // A natively-disabled button fires no click at all, so this handler simply
      // does not run when `disabled` — no guard needed, and none pretended. The
      // cell wrapper is what keeps a click on the surrounding plane off the row.
      onClick={(event) => {
        event.stopPropagation();
        onToggle({ shiftKey: event.shiftKey });
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
        // Face sits at the TOP of each row cell (operator 2026-09-04: "most
        // top of the column per rows"). Hit plane stays the full cell. `pt-1`
        // is spacingScale.1 — the same 4px slack the narrow select track already
        // budgets horizontally — so the 16px square does not sit on the hairline.
        'ds-raw-button group/select flex h-full w-full shrink-0 items-start justify-center self-stretch rounded-none border-0 bg-transparent pt-1',
        disabled && 'cursor-not-allowed opacity-50',
        // A full-bleed face fills its cell exactly and the cell clips, so an
        // OFFSET ring (what `'control'` paints) lands outside the border box and
        // is scissored away — the keyboard user gets no focus indicator at all.
        // `'cell'` is the inset ring the focus-ring SoT documents for precisely
        // this: "an offset ring would paint outside the cell and be clipped".
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
