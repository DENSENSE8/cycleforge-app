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
 * sibling {@link ProcedureCards} is the **work surface** — one card at a time,
 * carrying that step's own controls.
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

export type { ProcedureStepState, ProcedureStepRow } from './types';

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

export function ProcedureChecklist({
  steps,
  title,
  onSelectStep,
  className,
}: {
  steps: ReadonlyArray<ProcedureStepRow>;
  /** Eyebrow above the list — the station's name for its procedure. */
  title?: string;
  /** Optional: jump to a step. Omit for a read-only checklist. */
  onSelectStep?: (key: string) => void;
  className?: string;
}) {
  if (steps.length === 0) return null;

  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label={title ?? 'Procedure'}>
      {title ? (
        <p className="inset-field pb-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
          {title}
        </p>
      ) : null}

      <ol className="flex min-w-0 flex-col divide-y divide-border-hairline">
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
              className={cn(
                'inset-cozy',
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
