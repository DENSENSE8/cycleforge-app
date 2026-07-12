export type ReceivingStepKey = 'scan' | 'photos' | 'condition' | 'serial' | 'print';

export type LinearStepState = 'done' | 'active' | 'pending';

export const RECEIVING_WORKFLOW_STEPS: ReadonlyArray<{
  key: ReceivingStepKey;
  label: string;
}> = [
  { key: 'scan', label: 'Scan' },
  { key: 'photos', label: 'Photos' },
  { key: 'condition', label: 'Condition' },
  { key: 'serial', label: 'Serial' },
  { key: 'print', label: 'Print' },
];

export interface DeriveReceivingStepStatesInput {
  /** Carton opened via scanner (true) vs sidebar rail click (false). */
  scanDriven?: boolean;
  photoCount: number;
  serialCount: number;
  quantityExpected: number;
  conditionSet: boolean;
  labelPrinted: boolean;
}

/**
 * Pure step-state derivation for the unbox progress stepper.
 *
 * Each step is done only when its own gate passes — never short-circuited by
 * workflow-complete status, which previously marked Condition/Print done while
 * Photos was still the active step on reopened lines.
 */
export function deriveReceivingStepFlags(input: DeriveReceivingStepStatesInput): Record<ReceivingStepKey, boolean> {
  const expected = input.quantityExpected ?? 0;
  const isSerialDone = expected > 0 ? input.serialCount >= expected : input.serialCount > 0;

  return {
    scan: input.scanDriven !== false,
    photos: input.photoCount > 0,
    condition: input.conditionSet,
    serial: isSerialDone,
    print: input.labelPrinted,
  };
}

/**
 * Completeness checklist, not a wizard: every step reflects its OWN data gate.
 * The active step is the first incomplete one (the operator's next job), but a
 * later step whose gate already passes still shows done — picking a condition
 * before taking photos must read as Condition ✓ / Photos active, never
 * Condition "pending". (The previous chain-gated walk masked own-gate-passing
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
