'use client';

import { Fragment } from 'react';
import { Check } from '@/components/Icons';
import type { LinearStepState, ReceivingStepKey } from './derive-receiving-step-states';

export type { LinearStepState, ReceivingStepKey };
export type LinearStep = { key: string; label: string };

export { deriveReceivingStepStates, activeReceivingStepKey } from './derive-receiving-step-states';

/**
 * Shared dot + connector stepper — used by ReceivingDetailsStack carton
 * pipeline, claim modal, Repair intake, and Shipped order pipeline. Not mounted
 * in the Unbox/Triage workspace chrome.
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
              <StepDot state={s} index={idx + 1} compact={compact} />
              <span className={`whitespace-nowrap text-center ${labelClass} ${labelTone}`}>
                {step.label}
              </span>
            </>
          );

          return (
            <Fragment key={step.key}>
              {idx > 0 ? (
                <li aria-hidden className={`min-w-0 flex-1 self-start ${connectorPt}`}>
                  <span
                    className={`block h-px w-full ${
                      prevState === 'done' ? 'bg-blue-300' : 'bg-surface-strong'
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

function StepDot({
  state,
  index,
  compact = false,
}: {
  state: LinearStepState;
  index: number;
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
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface-card font-semibold text-blue-700 ring-2 ring-blue-500 ${sizeClass} ${
          compact ? 'text-role-micro' : 'text-role-eyebrow'
        }`}
      >
        {index}
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-strong ring-1 ring-inset ring-border-soft ${sizeClass}`}
      aria-hidden
    />
  );
}
