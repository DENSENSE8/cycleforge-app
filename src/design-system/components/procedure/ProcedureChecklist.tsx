'use client';

import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/**
 * Procedure checklist — the station's steps, all of them, at a glance.
 *
 * The house display for "what this station asks of the operator, and where they
 * are in it". Dumb by construction: it takes resolved steps and renders them.
 * Every domain (Unbox, Testing, Triage, Pack) supplies its own vocabulary from
 * its step SoT; this component learns no domain.
 *
 * ## Why a checklist and not a stack
 *
 * A checklist shows the WHOLE procedure — done, current, and not-yet — so the
 * operator can see the shape of the work before they are in it. The earlier
 * mid-canvas capture stack hid pending steps and re-ordered completed ones to
 * keep the current card at the bottom; that made the procedure unreadable as a
 * procedure, and it competed with the work surface for the middle of the screen.
 * Steps here render in vocabulary order, always, with no reordering.
 *
 * ## Anatomy
 *
 * One row per step: marker → label → summary. House one-row anatomy
 * (`ui-design-system.md`): left-aligned, `truncate`, constant row height,
 * selection is background + ring only — never a size shift.
 */

export type ProcedureStepState = 'done' | 'active' | 'pending';

export interface ProcedureChecklistStep {
  key: string;
  label: string;
  state: ProcedureStepState;
  /** Right-hand fact for this step — "3 photos", "2 of 5", a grade. */
  summary?: string;
  /** 1-based position in the procedure. Rendered on the active step's marker. */
  position: number;
}

function StepMarker({ state, position }: { state: ProcedureStepState; position: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-2.5 w-2.5" aria-hidden />
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
  steps: ReadonlyArray<ProcedureChecklistStep>;
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
          const row = (
            <div className="flex min-w-0 items-center gap-2">
              <StepMarker state={step.state} position={step.position} />
              <span
                className={cn(
                  'truncate text-role-caption font-semibold',
                  step.state === 'pending' ? 'text-text-muted' : 'text-text-default',
                )}
              >
                {step.label}
              </span>
              {step.summary ? (
                <span className="ml-auto truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {step.summary}
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
