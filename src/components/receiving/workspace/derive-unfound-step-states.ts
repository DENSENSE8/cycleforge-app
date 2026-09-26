import {
  RECEIVING_WORKFLOW_STEPS,
  deriveReceivingStepFlags,
  deriveLinearStepStates,
  type DeriveReceivingStepStatesInput,
  type LinearStepState,
  type ReceivingStepKey,
} from './derive-receiving-step-states';

/** Unfound flow = the matched unbox flow with a `Classify` step PREPENDED: */
export type UnfoundStepKey = 'classify' | ReceivingStepKey;

export const UNFOUND_WORKFLOW_STEPS: ReadonlyArray<{
  key: UnfoundStepKey;
  label: string;
}> = [{ key: 'classify', label: 'Classify' }, ...RECEIVING_WORKFLOW_STEPS];

export interface DeriveUnfoundStepStatesInput extends DeriveReceivingStepStatesInput {
  /** A concrete intake disposition has been assigned to this carton — resolve via `isIntakeClassified(row)`… */
  classified: boolean;
}

/** Classify → Photos → Serial → Print. */
export function deriveUnfoundStepStates(
  input: DeriveUnfoundStepStatesInput,
): Record<UnfoundStepKey, LinearStepState> {
  const base = deriveReceivingStepFlags(input);
  return deriveLinearStepStates([
    { key: 'classify', done: input.classified },
    ...RECEIVING_WORKFLOW_STEPS.map(({ key }) => ({ key, done: base[key] })),
  ]) as Record<UnfoundStepKey, LinearStepState>;
}
