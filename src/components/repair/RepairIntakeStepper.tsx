'use client';

import { LinearWorkflowStepper } from '@/components/receiving/workspace/ReceivingProgressStepper';
import {
  deriveLinearStepStates,
  type LinearStepState,
} from '@/components/receiving/workspace/derive-receiving-step-states';

export type RepairIntakeStepKey = 'product' | 'issue' | 'contact' | 'review';

export const REPAIR_INTAKE_STEPS: ReadonlyArray<{
  key: RepairIntakeStepKey;
  label: string;
  /** Compact chrome-row label — fits the single-row intake header. */
  shortLabel: string;
}> = [
  { key: 'product', label: 'Repair Service', shortLabel: 'Service' },
  { key: 'issue', label: 'Issue / Reason', shortLabel: 'Issue' },
  { key: 'contact', label: 'Contact Information', shortLabel: 'Contact' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
];

/**
 * Wizard-style step states for repair intake — earlier steps are `done`, the
 * current step is `active`, later steps are `pending`. Feeds
 * {@link deriveLinearStepStates} so Repair shares the Unbox stepper walk.
 */
export function deriveRepairIntakeStepStates(
  currentStep: RepairIntakeStepKey,
): Record<string, LinearStepState> {
  const flags = REPAIR_INTAKE_STEPS.map((step) => {
    const order = REPAIR_INTAKE_STEPS.map((s) => s.key);
    const ci = order.indexOf(currentStep);
    const ki = order.indexOf(step.key);
    return { key: step.key, done: ki < ci };
  });
  // Force the current step active even though its own gate isn't "done" yet —
  // deriveLinearStepStates marks the first incomplete as active, which matches
  // wizard navigation (product → issue → contact → review).
  return deriveLinearStepStates(flags);
}

interface RepairIntakeStepperProps {
  currentStep: RepairIntakeStepKey;
  /** Inline header row — short labels, tighter spacing. */
  compact?: boolean;
  /** Stretch connectors to fill the host column width (e.g. 720px). */
  spread?: boolean;
  onStepClick?: (key: RepairIntakeStepKey) => void;
  canNavigateTo?: (key: RepairIntakeStepKey) => boolean;
}

/**
 * Repair intake progress — composes {@link LinearWorkflowStepper} (Unbox-family
 * SoT) instead of a parallel dot+connector implementation.
 */
export function RepairIntakeStepper({
  currentStep,
  compact = false,
  spread = false,
  onStepClick,
  canNavigateTo,
}: RepairIntakeStepperProps) {
  const states = deriveRepairIntakeStepStates(currentStep);
  const steps = REPAIR_INTAKE_STEPS.map((step) => ({
    key: step.key,
    label: compact ? step.shortLabel : step.label,
  }));

  return (
    <LinearWorkflowStepper
      steps={steps}
      states={states}
      ariaLabel="Repair intake progress"
      size={compact || spread ? 'compact' : 'default'}
      className={spread ? 'w-full' : undefined}
      onStepClick={
        onStepClick
          ? (key) => {
              const k = key as RepairIntakeStepKey;
              if (states[k] !== 'done') return;
              if (canNavigateTo && !canNavigateTo(k)) return;
              onStepClick(k);
            }
          : undefined
      }
      isStepDisabled={(key) => {
        const k = key as RepairIntakeStepKey;
        if (states[k] !== 'done') return true;
        if (canNavigateTo && !canNavigateTo(k)) return true;
        return false;
      }}
    />
  );
}
