'use client';

import { Fragment } from 'react';
import { Check } from '@/components/Icons';
// `ReceivingStepKey` is deliberately NOT re-exported here — its consumers
// (`derive-unfound-step-states`, the stepper tests) import it from
// `derive-receiving-step-states` directly, so a second path to the same type is
// dead weight that knip correctly flags.
import type { LinearStepState } from './derive-receiving-step-states';

export type { LinearStepState };
export type LinearStep = { key: string; label: string };

export { deriveReceivingStepStates } from './derive-receiving-step-states';

/**
 * Wizard stepper — position in a FORM, and nothing else. Repair intake is the
 * caller (Service → Issue → Contact → Review): steps are clickable, carry no
 * actor and no timestamp, and the walk is navigation rather than history.
 *
 * The milestone pipelines (order · carton · arrival) are NOT this component.
 * They were, briefly, with `marker` / `body` / `connectorPadClass` slots
 * bending a wizard into a timeline — which is how a component ends up with a
 * prop that replaces its own rendering. They now compose
 * `design-system/components/milestone-pipeline`, whose every stage carries a
 * person and an instant. Two nouns, two components, neither with a slot.
 *
 * (The old docblock also claimed a claim-modal caller. There has never been
 * one.)
 */
export function LinearWorkflowStepper({
  steps,
  states,
  ariaLabel,
  ariaDescription,
  className = '',
  size = 'default',
  onStepClick,
  isStepDisabled,
}: {
  steps: ReadonlyArray<LinearStep>;
  states: Record<string, LinearStepState>;
  ariaLabel: string;
  ariaDescription?: string;
  className?: string;
  size?: 'default' | 'compact';
  onStepClick?: (key: string) => void;
  isStepDisabled?: (key: string) => boolean;
}) {
  const compact = size === 'compact';
  const connectorPt = compact ? 'pt-1.5' : 'pt-2';
  const stepGap = compact ? 'gap-0.5' : 'gap-1';
  const labelClass = compact
    ? 'text-role-eyebrow uppercase leading-none tracking-[0.1em]'
    : 'text-role-micro uppercase leading-none tracking-[0.12em]';

  return (
    <nav aria-label={ariaLabel} aria-description={ariaDescription} className={className}>
      <ol className="flex w-full items-start">
        {steps.map((step, idx) => {
          const s = states[step.key] ?? 'pending';
          const prevState = idx > 0 ? (states[steps[idx - 1].key] ?? 'pending') : null;
          const labelTone =
            s === 'active'
              ? 'text-text-default font-semibold'
              : s === 'done'
                ? 'text-text-faint'
                : 'text-text-faint/70';
          const disabled = isStepDisabled?.(step.key) ?? false;
          const clickable = !!onStepClick && !disabled;

          const stepContent = (
            <>
              <StepDot state={s} compact={compact} />
              <span className={`whitespace-nowrap text-center ${labelClass} ${labelTone}`}>
                {step.label}
              </span>
            </>
          );

          return (
            <Fragment key={step.key}>
              {idx > 0 ? (
                // `min-w-6`, not `min-w-0`: a `flex-1` rail with no floor
                // collapses to nothing the moment the column is narrow, and the
                // stepper silently becomes three detached blocks. The rail is
                // the thing that makes them one progression — it must survive
                // the squeeze even if the labels have to.
                <li aria-hidden className={`min-w-6 flex-1 self-start ${connectorPt}`}>
                  <span
                    className={`block h-0.5 w-full rounded-full ${
                      prevState === 'done' ? 'bg-blue-500' : 'bg-border-soft'
                    }`}
                  />
                </li>
              ) : null}
              <li className={`flex shrink-0 flex-col items-center ${stepGap}`}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(step.key)}
                    className={`ds-raw-button flex flex-col items-center ${stepGap}`}
                  >
                    {stepContent}
                  </button>
                ) : (
                  <div
                    className={`flex flex-col items-center ${stepGap} ${
                      disabled ? 'cursor-not-allowed opacity-45' : ''
                    }`}
                  >
                    {stepContent}
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The done / active / pending marker for the dot bar.
 *
 * NOTE: `ProcedureChecklist` (DS) now renders its own visually-identical marker,
 * because a design-system component must not import from `components/receiving`.
 * That is a real duplication — the consolidation is to promote the marker into
 * the design system and have this stepper consume it. Left as a follow-up rather
 * than done in passing, since this stepper has five other consumers.
 */
function StepDot({
  state,
  compact = false,
}: {
  state: LinearStepState;
  compact?: boolean;
}) {
  const sizeClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const checkClass = compact ? 'h-2 w-2' : 'h-2.5 w-2.5';
  if (state === 'done') {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600 text-white ${sizeClass}`}
      >
        <Check className={checkClass} aria-hidden />
      </span>
    );
  }
  if (state === 'active') {
    // A hollow blue dot, not the step's ordinal. The number was answering a
    // question nobody asks — the position is already given by where the marker
    // sits on the bar — while making the live stage the one marker that renders
    // a glyph instead of a state. Ring + empty centre reads as "here, not yet
    // done" against the filled check to its left and the grey fill to its right.
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface-card ring-2 ring-blue-500 ${sizeClass}`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-strong ring-1 ring-inset ring-border-soft ${sizeClass}`}
      aria-hidden
    />
  );
}
