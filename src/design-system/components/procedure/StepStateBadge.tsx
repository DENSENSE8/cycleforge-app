import { Check, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { ProcedureStepState } from './types';

/**
 * Step-state mark — a flush **checkbox-shaped box**, matching the house select
 * gutter ({@link GridRowCheckbox} face: `h-4 w-4 rounded border`), never a
 * `rounded-full` status dot. This is what makes the procedure checklist read as
 * boxes "like the rest of the codebase".
 *
 * ## It is a DISPLAY, not a Checkbox
 *
 * The box is a `<span>` and never toggles. A procedure step is
 * **evidence-derived** — a square that clicks to tick would reintroduce the
 * banned hand-ticked checklist (`display/station.md`, `display/instrument-panel.md`:
 * hand-ticked lists were deleted and stay deleted). Shape changed; interaction
 * did not.
 *
 * ## `skipped` stays a waiver, never a check
 *
 * A skip records that a person looked at a step and moved past it — it does not
 * claim the work happened. It keeps the chevron, never the check, so the
 * done/skipped distinction survives the reshape (see `types.ts`).
 *
 * One mark for both views — {@link ProcedureChecklist} (edge reference) and
 * {@link ProcedureDeck} (work surface) render the same resolved steps, so a
 * shared mark is what keeps them from drifting on shape.
 */
const STEP_MARK_BOX = 'flex h-4 w-4 shrink-0 items-center justify-center rounded border';

export function StepStateBadge({
  state,
  position,
  variant = 'full',
}: {
  state: ProcedureStepState;
  /** 1-based step number — rendered on the `active` box (checklist only). */
  position?: number;
  /**
   * `'full'` (checklist): renders done · skipped · active · pending.
   * `'status'` (deck): done · skipped only — the medallion icon carries active
   * and pending there, so those return `null`.
   */
  variant?: 'full' | 'status';
}) {
  if (state === 'done') {
    // Checked box — filled accent + check (the grid "on" face, house blue).
    return (
      <span className={cn(STEP_MARK_BOX, 'border-blue-600 bg-blue-600 text-white')}>
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (state === 'skipped') {
    // Waiver, not a check — a muted box with a move-past chevron.
    return (
      <span className={cn(STEP_MARK_BOX, 'border-border-soft bg-surface-strong text-text-soft')}>
        <ChevronRight className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (variant === 'status') return null;
  if (state === 'active') {
    // Current step — an outlined box carrying its number.
    return (
      <span
        className={cn(
          STEP_MARK_BOX,
          'border-2 border-blue-500 bg-surface-card text-role-micro font-semibold text-blue-700',
        )}
      >
        {position}
      </span>
    );
  }
  // pending — an empty box (the grid "off" checkbox face).
  return <span className={cn(STEP_MARK_BOX, 'border-border-default bg-surface-card')} aria-hidden />;
}
