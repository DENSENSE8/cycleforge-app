export type ReceivingStepKey = 'photos' | 'serial' | 'print';

export type LinearStepState = 'done' | 'active' | 'pending';

export const RECEIVING_WORKFLOW_STEPS: ReadonlyArray<{
  key: ReceivingStepKey;
  label: string;
}> = [
  { key: 'photos', label: 'Photos' },
  { key: 'serial', label: 'Serial' },
  { key: 'print', label: 'Print' },
];

export interface DeriveReceivingStepStatesInput {
  photoCount: number;
  serialCount: number;
  quantityExpected: number;
  labelPrinted: boolean;
}

/**
 * Pure step-state derivation for the unbox progress stepper.
 *
 * Each step is done only when its own gate passes — never short-circuited by
 * workflow-complete status, which previously marked Condition/Print done while
 * Photos was still the active step on reopened lines.
 *
 * Two steps are deliberately absent because they carry no signal — both are
 * always effectively done by the time the operator reads the bar, so a dot for
 * them only diluted the "you are here" marker:
 *   • `scan`      — reaching the unbox workspace *is* the scan (that's how the
 *                   line got populated); the PO/carton identity in the header
 *                   already encodes it.
 *   • `condition` — `condition_grade` is NOT NULL with a default, so the pill
 *                   always shows a grade (the auto-A UX). It's an assumed
 *                   default disposition operators only override for exceptions,
 *                   not a per-line decision gate. `condition_set_at` still
 *                   tracks explicit overrides for recommendations/analytics —
 *                   it is just no longer a stepper gate. (This removed the
 *                   frontend↔backend mismatch where the pill read "A selected"
 *                   but the dot read "not set".)
 *
 * Every remaining step reflects real, varying operator work.
 */
export function deriveReceivingStepFlags(input: DeriveReceivingStepStatesInput): Record<ReceivingStepKey, boolean> {
  const expected = input.quantityExpected ?? 0;
  const isSerialDone = expected > 0 ? input.serialCount >= expected : input.serialCount > 0;

  return {
    photos: input.photoCount > 0,
    serial: isSerialDone,
    print: input.labelPrinted,
  };
}

/**
 * Completeness checklist, not a wizard: every step reflects its OWN data gate.
 * The active step is the first incomplete one (the operator's next job), but a
 * later step whose gate already passes still shows done — printing a label
 * before capturing a serial must read as Print ✓ / Serial active, never
 * Print "pending". (The previous chain-gated walk masked own-gate-passing
 * steps behind incomplete priors, so the bar misreported real data state on
 * exactly the lines where operators work out of order.)
 */
export function deriveReceivingStepStates(
  input: DeriveReceivingStepStatesInput,
): Record<ReceivingStepKey, LinearStepState> {
  const flags = deriveReceivingStepFlags(input);
  const states = {} as Record<ReceivingStepKey, LinearStepState>;

  let activeAssigned = false;
  for (const { key } of RECEIVING_WORKFLOW_STEPS) {
    if (flags[key]) {
      states[key] = 'done';
    } else if (!activeAssigned) {
      states[key] = 'active';
      activeAssigned = true;
    } else {
      states[key] = 'pending';
    }
  }

  return states;
}

/** First active step key — used for step-aware UI (notes focus, photo peek, serial autofocus). */
export function activeReceivingStepKey(
  input: DeriveReceivingStepStatesInput,
): ReceivingStepKey | null {
  const states = deriveReceivingStepStates(input);
  const hit = RECEIVING_WORKFLOW_STEPS.find(({ key }) => states[key] === 'active');
  return hit?.key ?? null;
}
