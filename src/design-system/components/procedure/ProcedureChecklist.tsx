'use client';

import { Check, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { ProcedureStepRow, ProcedureStepState } from './types';

/**
 * Procedure checklist — the station's steps, all of them, at a glance.
 *
 * The house display for "what this station asks of the operator, and where they
 * are in it". Dumb by construction: it takes resolved steps and renders them.
 * Every domain (Unbox, Testing, Triage, Pack) supplies its own vocabulary from
 * its step SoT; this component learns no domain.
 *
 * ## Checklist vs cards — two surfaces, one vocabulary
 *
 * This is the **right-edge reference** display: the whole procedure, in
 * vocabulary order, nothing hidden, so the operator can see the shape of the
 * work and where they are in it *without leaving the step they are on*. Its
 * sibling {@link ProcedureDeck} is the **work surface** — one expanded section
 * at a time, showing that step's evidence. Neither surface carries the step's
 * action button; on Unbox that lives in the bottom dock, which is pinned while
 * both of these scroll.
 *
 * They are not a duplication, and the earlier "exactly ONE procedure surface"
 * rule that deleted this component was reading them as one. They answer
 * different questions from opposite edges: *where am I in the whole job* versus
 * *what do I do right now*. Both render from the SAME resolved
 * `ProcedureStepRow[]`, so they cannot disagree — that, not deletion, is what
 * keeps two views of one procedure honest. Rows here render in vocabulary order,
 * always, with no reordering.
 *
 * ## Anatomy
 *
 * One row per step: marker → label → summary. House one-row anatomy
 * (`ui-design-system.md`): left-aligned, `truncate`, constant row height,
 * selection is background + ring only — never a size shift.
 */

function StepMarker({ state, position }: { state: ProcedureStepState; position: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  // Never a check. A waiver is a decision to move past, not evidence of work,
  // and this glyph is the only thing carrying that difference in the row.
  if (state === 'skipped') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-soft ring-1 ring-inset ring-border-soft">
        <ChevronRight className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-card text-role-micro font-semibold text-blue-700 ring-2 ring-blue-500">
        {position}
      </span>
    );
  }
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong ring-1 ring-inset ring-border-soft"
      aria-hidden
    />
  );
}

/**
 * Cozy-row height for preview viewport math: `inset-cozy` (py-1.5) + 16px
 * marker ≈ 40px. Module-private — the only consumer is this file's own
 * `maxVisibleRows` math, and an exported geometry constant is a second place
 * for row height to be declared. Keep in sync with the row anatomy below.
 */
const PROCEDURE_CHECKLIST_ROW_PX = 40;

export function ProcedureChecklist({
  steps,
  title,
  onSelectStep,
  className,
  maxVisibleRows,
}: {
  steps: ReadonlyArray<ProcedureStepRow>;
  /** Eyebrow above the list — the station's name for its procedure. */
  title?: string;
  /** Optional: jump to a step. Omit for a read-only checklist. */
  onSelectStep?: (key: string) => void;
  className?: string;
  /**
   * Cap the visible list to N rows (scroll for the rest). Omit for fit-height
   * surfaces such as the scan-station hover peek.
   */
  maxVisibleRows?: number;
}) {
  if (steps.length === 0) return null;

  const listMaxHeight =
    maxVisibleRows != null && maxVisibleRows > 0
      ? maxVisibleRows * PROCEDURE_CHECKLIST_ROW_PX
      : undefined;

  return (
    <section
      className={cn('flex min-w-0 flex-col', className)}
      aria-label={title ?? 'Procedure'}
      // Sibling of `data-procedure-deck`. Both surfaces render the SAME
      // `data-procedure-step` keys — one derivation, two views — so a probe that
      // does not name which view it means silently reads both lists at once.
      data-procedure-checklist
    >
      {title ? (
        <p className="inset-field pb-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
          {title}
        </p>
      ) : null}

      <ol
        className={cn(
          'flex min-w-0 flex-col divide-y divide-border-hairline',
          listMaxHeight != null && 'overflow-y-auto',
        )}
        style={listMaxHeight != null ? { maxHeight: listMaxHeight } : undefined}
      >
        {steps.map((step) => {
          const isActive = step.state === 'active';
          const trailing =
            step.state === 'skipped'
              ? step.skipReason
                ? `Skipped · ${step.skipReason}`
                : 'Skipped'
              : step.summary;
          const row = (
            <div className="flex min-w-0 items-center gap-2">
              <StepMarker state={step.state} position={step.position} />
              <span
                className={cn(
                  'truncate text-role-caption font-semibold',
                  step.state === 'pending' || step.state === 'skipped'
                    ? 'text-text-muted'
                    : 'text-text-default',
                )}
              >
                {step.label}
              </span>
              {trailing ? (
                <span className="ml-auto truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {trailing}
                </span>
              ) : null}
            </div>
          );

          return (
            <li
              key={step.key}
              data-procedure-step={step.key}
              data-procedure-state={step.state}
              // Selection never size-shifts: fill + inset ring only, constant py.
              // Fixed min-height keeps the hover-peek viewport honest at N rows.
              className={cn(
                'inset-cozy min-h-10 box-border',
                isActive && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
              )}
            >
              {onSelectStep ? (
                <button
                  type="button"
                  onClick={() => onSelectStep(step.key)}
                  className="ds-raw-button block w-full min-w-0 text-left"
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
