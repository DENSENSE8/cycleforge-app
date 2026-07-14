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
  /**
   * Operator waived the serial for this line (no serial: cable / bulk / return
   * with none). A first-class COMPLETION of the Serial step — not missing data —
   * so it satisfies the gate exactly like a captured serial does. Durable, from
   * `receiving_line_testing.serial_absent` via `row.serial_absent`.
   */
  serialAbsent?: boolean;
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
  // The no-serial waiver completes the step outright — a cable/bulk/return with
  // no serial is DONE, not "0 serials, still pending". Otherwise gate on count.
  const isSerialDone =
    !!input.serialAbsent ||
    (expected > 0 ? input.serialCount >= expected : input.serialCount > 0);

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

/**
 * The shared completeness-checklist walk for EVERY receiving-family stepper
 * (matched unbox, unfound). A step is `done` when its own gate passes; the FIRST
 * incomplete step is `active` (the operator's next job); the rest are `pending`.
 * Order matters only for which incomplete step wears the active marker — a later
 * done step still reads done, never masked behind an incomplete prior.
 *
 * Compose this; never re-implement the walk per stepper. A new receiving flow
 * grows its own step *vocabulary* (its `LinearStepFlag[]`) and feeds it here —
 * that is a sibling flow over the shared primitive, not a forked stepper
 * (AGENTS.md → Compose → grow the SoT → compound).
 */
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
