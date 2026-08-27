import {
  RECEIVING_WORKFLOW_STEPS,
  deriveReceivingStepFlags,
  deriveLinearStepStates,
  type DeriveReceivingStepStatesInput,
  type LinearStepState,
  type ReceivingStepKey,
} from './derive-receiving-step-states';

/**
 * Unfound flow = the matched unbox flow with a `Classify` step PREPENDED:
 *
 *   Classify → Photos → Serial → Print
 *
 * Photos / Serial / Print are byte-identical to the matched flow — same gates,
 * same order, same `deriveReceivingStepFlags`. The only addition is the
 * identity-resolution step that a matched carton already has answered by its PO.
 *
 * This is a DIFFERENT JOB (classify-first vs complete-first) expressed as a
 * longer step *vocabulary* over the SAME shared primitive (`LinearWorkflowStepper`)
 * and the SAME walk (`deriveLinearStepStates`) — a sibling flow, not a forked
 * stepper (AGENTS.md → Compose → grow the SoT → compound).
 */
export type UnfoundStepKey = 'classify' | ReceivingStepKey;

export const UNFOUND_WORKFLOW_STEPS: ReadonlyArray<{
  key: UnfoundStepKey;
  label: string;
}> = [{ key: 'classify', label: 'Classify' }, ...RECEIVING_WORKFLOW_STEPS];

export interface DeriveUnfoundStepStatesInput extends DeriveReceivingStepStatesInput {
  /**
   * A concrete intake disposition has been assigned to this carton — resolve via
   * `isIntakeClassified(row)` (`src/lib/receiving/triage-intake-kind.ts`), which
   * reads the disposition fields the line row carries. A fresh unfound carton is
   * unclassified (`intake_type` has no DB default), so this is `false` and the
   * `Classify` dot holds the active marker until the door pick lands.
   */
  classified: boolean;
}

/**
 * Classify → Photos → Serial → Print. Completeness checklist, not a wizard (same
 * walk as matched): `Classify` is `done` once the carton is classified and
 * otherwise holds `active`; Photos / Serial / Print derive exactly as they do
 * for a matched carton — so a photo shot before classifying still reads
 * Photos ✓, with `Classify` merely the active "you are here" marker.
 */
export function deriveUnfoundStepStates(
  input: DeriveUnfoundStepStatesInput,
): Record<UnfoundStepKey, LinearStepState> {
  const base = deriveReceivingStepFlags(input);
  return deriveLinearStepStates([
    { key: 'classify', done: input.classified },
    ...RECEIVING_WORKFLOW_STEPS.map(({ key }) => ({ key, done: base[key] })),
  ]) as Record<UnfoundStepKey, LinearStepState>;
}
