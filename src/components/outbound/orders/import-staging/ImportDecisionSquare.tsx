'use client';

/**
 * One decision square in a table-import row's right gutter — approve or reject.
 *
 * **Why this exists as its own control.** A `google_sheets` staging board is a
 * human sheet, so every row is a verdict rather than a parse to accept in bulk
 * (`@/lib/orders-sync/sheets-inline-triage`). The verdict has to be reachable
 * where the row is, which means a square in the row's own gutter — not a
 * selection + toolbar round trip, and not a menu.
 *
 * **The geometry is derived, not typed.** `CSV_IMPORT_STAGING_GUTTER_CLASS`
 * mirrors `CSV_IMPORT_STAGING_GUTTER_REM`, the same constant that sizes the
 * `select` track and (doubled) the `actions` track, and `h-full` takes the row
 * box. So the approve check, the reject X and the left checkmark are one box
 * three times over — the operator requirement — rather than three literals
 * that happen to agree today.
 *
 * **Off-state borrows `GridSelectSquareFace`'s language on purpose:** the SAME
 * glyph at a faded weight, never a different shape. A column that paints
 * nothing at rest cannot be told apart from empty space, which is the exact
 * defect the select gutter fixed in 2026-08.
 */

import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { Check, X } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { CSV_IMPORT_STAGING_GUTTER_CLASS } from './csv-import-staging-grid-layout';

export type ImportDecisionTone = 'approve' | 'reject';

export function ImportDecisionSquare({
  tone,
  active,
  label,
  onPress,
  sizeClass = CSV_IMPORT_STAGING_GUTTER_CLASS,
}: {
  tone: ImportDecisionTone;
  /** This row currently carries THIS verdict. Pressing again clears it. */
  active: boolean;
  /** Accessible name — say what the click does, including the undo direction. */
  label: string;
  onPress: () => void;
  /**
   * Width of the square. Defaults to the staging board's gutter track; the
   * desk's stage-gutter overlay passes the compound row box (`w-12` / 48px) so
   * its squares match the LIVE table's left select gutter instead.
   */
  sizeClass?: string;
}) {
  return (
    <button
      type="button"
      // A toggle, and it says so: an approved row's approve square is pressed,
      // and activating it unapproves. That is the manual-sheet requirement, so
      // it belongs in the a11y tree and not only in the paint.
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-testid={tone === 'approve' ? 'import-triage-approve' : 'import-triage-reject'}
      data-decision-state={active ? 'on' : 'off'}
      // The row underneath opens the record — a decision must never do both.
      // `dblclick` is a separate event from `click`, so stopping one does
      // nothing for the other (the lesson `GridRowCheckbox` already learned).
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      className={cn(
        // ds-raw-button: gutter square — DS Button has no glyph-square variant.
        // Same documented exemption GridRowCheckbox takes for the left gutter.
        'ds-raw-button flex h-full shrink-0 items-center justify-center rounded-none border-0 transition-colors',
        sizeClass,
        active
          ? tone === 'approve'
            ? 'bg-surface-success text-text-success'
            : 'bg-surface-danger text-text-danger'
          : cn(
              'bg-transparent text-text-faint/60',
              tone === 'approve' ? 'hover:text-text-success' : 'hover:text-text-danger',
            ),
        // A full-bleed square inside a clipping cell: an offset ring would paint
        // outside the border box and be scissored away, so this is the inset
        // `cell` ring the focus-ring SoT documents for exactly that case.
        focusRing('cell'),
      )}
    >
      {tone === 'approve' && active ? (
        // Draws itself on landing — the mark IS the acknowledgement.
        <AnimatedCheck size={14} />
      ) : tone === 'approve' ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
