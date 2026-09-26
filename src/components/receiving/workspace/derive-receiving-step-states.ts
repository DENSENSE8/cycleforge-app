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
  /** Operator waived the serial for this line (no serial: */
  serialAbsent?: boolean;
  /** Count of per-unit waivers on this line (`receiving_line_unit.serial_absent`). */
  perUnitAbsentCount?: number;
}

/** Pure step-state derivation for the unbox progress stepper. */
export function deriveReceivingStepFlags(input: DeriveReceivingStepStatesInput): Record<ReceivingStepKey, boolean> {
  const expected = input.quantityExpected ?? 0;
  const perUnitAbsent = Math.max(0, Math.floor(Number(input.perUnitAbsentCount ?? 0)) || 0);
  // Precedence (stated once — plan §3):
  const isSerialDone =
    !!input.serialAbsent ||
    (expected > 0
      ? input.serialCount + perUnitAbsent >= expected
      : input.serialCount > 0);

  return {
    photos: input.photoCount > 0,
    serial: isSerialDone,
    print: input.labelPrinted,
  };
}

/** One ordered step + its own completion gate — the input to {@link deriveLinearStepStates}. */
export interface LinearStepFlag {
  key: string;
  done: boolean;
}

/** The shared completeness-checklist walk for EVERY receiving-family stepper (matched unbox, unfound). */
export function deriveLinearStepStates(
  flags: ReadonlyArray<LinearStepFlag>,
): Record<string, LinearStepState> {
  const states: Record<string, LinearStepState> = {};
  let activeAssigned = false;
  for (const { key, done } of flags) {
    if (done) {
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

/** Completeness checklist, not a wizard: */
export function deriveReceivingStepStates(
  input: DeriveReceivingStepStatesInput,
): Record<ReceivingStepKey, LinearStepState> {
  const flags = deriveReceivingStepFlags(input);
  return deriveLinearStepStates(
    RECEIVING_WORKFLOW_STEPS.map(({ key }) => ({ key, done: flags[key] })),
  ) as Record<ReceivingStepKey, LinearStepState>;
}

/** First active step key — used for step-aware UI (notes focus, photo peek, serial autofocus). */
export function activeReceivingStepKey(
  input: DeriveReceivingStepStatesInput,
): ReceivingStepKey | null {
  const states = deriveReceivingStepStates(input);
  const hit = RECEIVING_WORKFLOW_STEPS.find(({ key }) => states[key] === 'active');
  return hit?.key ?? null;
}

