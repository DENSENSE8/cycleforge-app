import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveContextFromFlags,
  resolveProcedureSteps,
  type ProcedureResolveContext,
  type ProcedureVariant,
} from '@/lib/stations/procedure';
import {
  deriveReceivingStepFlags,
  deriveLinearStepStates,
  type DeriveReceivingStepStatesInput,
  type LinearStepFlag,
  type LinearStepState,
} from './derive-receiving-step-states';

/** Capture-stack step gates — the bench half of the operator-facing unbox procedure: */

// Not exported until a consumer outside this module needs it — the knip ratchet
// only shrinks, and "Phase 3 will import it" is exactly the claim it exists to
// reject. Consumers reach these through `CaptureStepDef` / `ProcedureStepRow`.
type CaptureStepKey =
  | 'classify'
  | 'arrival_label_photo'
  | 'arrival_box_photo'
  | 'shipping_label_photo'
  | 'box_photo'
  | 'packing_material'
  | 'contents'
  | 'condition'
  | 'item_photos'
  | 'serial'
  | 'label';

/** The receiving photo stage a step reads (and, from Phase 3, captures into). */
type CaptureStepStage = 'arrival_package' | 'unbox_carton' | 'unbox_item';

interface CaptureStepDef {
  /** Open `string`, not `CaptureStepKey`: */
  key: string;
  label: string;
  /** Photo stage this step is evidenced by, when it is a photo step. */
  stage?: CaptureStepStage;
  /** The single shot this step is evidenced by, within {@link stage}. */
  aspect?: PhotoAspect;
  /** The aspect SET this step is evidenced by — `item_photos`. */
  aspectSet?: readonly PhotoAspect[];
  /** Declared for multi-qty lines so the row can carry `n of N` progress. */
  perUnit?: boolean;
}

/** Every key this module knows how to GATE. */
const GATED_KEYS: Record<CaptureStepKey, true> = {
  classify: true,
  arrival_label_photo: true,
  arrival_box_photo: true,
  shipping_label_photo: true,
  box_photo: true,
  packing_material: true,
  contents: true,
  condition: true,
  item_photos: true,
  serial: true,
  label: true,
};

function isCaptureStepKey(key: string): key is CaptureStepKey {
  return Object.prototype.hasOwnProperty.call(GATED_KEYS, key);
}

/**
 * How the bench selects a capture tree. Prefer {@link ProcedureResolveContext}
 * (`flow` + modifiers). Legacy three-boolean {@link ProcedureVariant} still
 * maps through {@link resolveContextFromFlags} for older call sites / tests.
 */
export type CaptureStepVocabularyInput = ProcedureResolveContext | ProcedureVariant;

/** Normalize vocabulary input to a flow context. */
function resolveCaptureVocabulary(
  input: CaptureStepVocabularyInput,
): ProcedureResolveContext {
  if (input && typeof input === 'object' && 'flow' in input) return input;
  const v = input as ProcedureVariant;
  return resolveContextFromFlags({
    isUnfound: !!v.isUnfound,
    isReturn: !!v.isReturn,
    isLocalPickup: !!v.isLocalPickup,
  });
}

/** The ordered step list for one carton's intake type — RESOLVED FROM THE STATION DECLARATION, not declared here. */
export function captureStepVocabulary(
  input: CaptureStepVocabularyInput,
): ReadonlyArray<CaptureStepDef> {
  registerBuiltinProcedures();
  const unbox = getProcedure('unbox');
  if (!unbox) return [];
  return resolveProcedureSteps(unbox, resolveCaptureVocabulary(input), 'capture').map((step) => ({
    key: step.key,
    label: step.label,
    stage: step.photoStage,
    aspect: step.photoAspect,
    aspectSet: step.photoAspectSet,
    perUnit: step.perUnit,
  }));
}

/**
 * `labelPrinted` is deliberately absent: the capture vocabulary has no Print
 * step (printing is the terminal dock's job, not a capture step), so requiring
 * it would thread a flag through every caller that nothing here reads.
 */
export interface DeriveCaptureStepStatesInput
  extends Omit<DeriveReceivingStepStatesInput, 'labelPrinted'> {
  vocabulary: CaptureStepVocabularyInput;
  /** Photos stamped `arrival_package` on this carton (door evidence). */
  arrivalPhotoCount: number;
  /** Photos stamped `unbox_carton` on this carton (bench carton evidence). */
  unboxCartonPhotoCount: number;
  /** Photos stamped `unbox_item` on THIS line. */
  itemPhotoCount: number;
  /**
   * Per-aspect photo counts on THIS carton (`arrival_package` stage). The two
   * door steps share that stage and are told apart by aspect alone.
   */
  arrivalAspectCounts: Partial<Record<PhotoAspect, number>>;
  /**
   * Per-aspect photo counts on THIS carton (`unbox_carton` stage). A missing key
   * is zero — the three carton shots are told apart by aspect alone, so a stage
   * count cannot answer them.
   */
  cartonAspectCounts: Partial<Record<PhotoAspect, number>>;
  /** Per-aspect photo counts on THIS line (`unbox_item` stage). */
  itemAspectCounts: Partial<Record<PhotoAspect, number>>;
  /** Org policy — which item aspects BLOCK the step (`receiving.requiredItemPhotoAspects`, default `included` + `serial`). */
  requiredItemAspects: readonly PhotoAspect[];
  /** `receiving_line_testing.condition_graded_at` — the grading ACT, not the grade. */
  conditionGradedAt: string | null;
  /** `receiving_unbox.contents_confirmed_at` — a human read the line list. */
  contentsConfirmedAt: string | null;
  /** `receiving_line_testing.label_previewed_at` — a human read the printed face. */
  labelPreviewedAt: string | null;
  /** Unfound only — `isIntakeClassified(row)`. Ignored for matched cartons. */
  classified?: boolean;
  /** When each step's evidence landed, by step key — a raw server instant, never a formatted string (this module is shared with a server read… */
  evidenceAt?: Readonly<Record<string, string | null | undefined>>;
}

/** Per-step completion gates. Every declared capture step has exactly one. */
export function deriveCaptureStepFlags(
  input: DeriveCaptureStepStatesInput,
): ReadonlyArray<LinearStepFlag> {
  // Serial reuses the matched flow's gate verbatim (whole-line waiver → per-unit accounting → overage), so the stack and the 3-dot bar can…
  const base = deriveReceivingStepFlags({ ...input, labelPrinted: false });

  return captureStepVocabulary(input.vocabulary).map((step): LinearStepFlag => {
    // The vocabulary now comes from the declaration, so a step could in principle arrive without a gate here.
    if (!isCaptureStepKey(step.key)) return { key: step.key, done: false };
    switch (step.key) {
      case 'classify':
        return { key: step.key, done: !!input.classified };
      // Door steps share `arrival_package` and are told apart by aspect —
      // same law as the bench carton trio one stage down.
      case 'arrival_label_photo':
      case 'arrival_box_photo':
        return { key: step.key, done: arrivalAspectShot(input, step.aspect) };
      // The three bench carton shots share one stage and are told apart by aspect.
      case 'shipping_label_photo':
      case 'box_photo':
      case 'packing_material':
        return { key: step.key, done: cartonAspectShot(input, step.aspect) };
      case 'contents':
        return { key: step.key, done: !!input.contentsConfirmedAt };
      case 'condition':
        // The GRADE is never the gate — it is NOT NULL with a default, so it
        // exists on a carton nobody has touched. The stamp is the act.
        return { key: step.key, done: !!input.conditionGradedAt };
      case 'item_photos':
        return { key: step.key, done: requiredItemAspectsShot(input) };
      case 'serial':
        return { key: step.key, done: base.serial };
      case 'label':
        // Reading a label leaves no evidence behind, so the acknowledgement is the only fact there is — the same shape as `contents`.
        return { key: step.key, done: !!input.labelPreviewedAt };
    }
  });
}

/** One carton shot of `aspect` exists. */
function arrivalAspectShot(
  input: DeriveCaptureStepStatesInput,
  aspect: PhotoAspect | undefined,
): boolean {
  if (!aspect) return input.arrivalPhotoCount > 0;
  return (input.arrivalAspectCounts[aspect] ?? 0) > 0;
}

function cartonAspectShot(
  input: DeriveCaptureStepStatesInput,
  aspect: PhotoAspect | undefined,
): boolean {
  if (!aspect) return input.unboxCartonPhotoCount > 0;
  return (input.cartonAspectCounts[aspect] ?? 0) > 0;
}

/** Every REQUIRED item aspect has at least one shot. */
function requiredItemAspectsShot(input: DeriveCaptureStepStatesInput): boolean {
  if (input.requiredItemAspects.length === 0) return input.itemPhotoCount > 0;
  return input.requiredItemAspects.every((a) => (input.itemAspectCounts[a] ?? 0) > 0);
}

/**
 * Completeness checklist, not a wizard — same contract as every receiving
 * stepper: a step is `done` when its OWN gate passes, the FIRST incomplete step
 * is `active`, the rest are `pending`. A later done step still reads done.
 */
export function deriveCaptureStepStates(
  input: DeriveCaptureStepStatesInput,
): Record<string, LinearStepState> {
  return deriveLinearStepStates(deriveCaptureStepFlags(input));
}

/** The step the operator is on — the capture stack's expanded card. */
export function activeCaptureStepKey(
  input: DeriveCaptureStepStatesInput,
): string | null {
  const states = deriveCaptureStepStates(input);
  const hit = captureStepVocabulary(input.vocabulary).find(
    (step) => states[step.key] === 'active',
  );
  return hit?.key ?? null;
}

/** One step of the station procedure, ready for `ProcedureChecklist`. Not
 *  exported until a caller names it — `deriveProcedureSteps` infers it. */
interface ProcedureStepRow {
  key: string;
  label: string;
  state: LinearStepState;
  /** 1-based position in the vocabulary — never a render index. */
  position: number;
  /** Photo stage this step is evidenced by, when it is a photo step. */
  stage?: 'arrival_package' | 'unbox_carton' | 'unbox_item';
  /**
   * The instant this step's gate closed — a raw server instant, `null` unless
   * the step is `done`. Display layers format it; this module never does.
   */
  at: string | null;
}

/** The instant a step's gate closed, before the done check. */
function stepCompletedAt(key: string, input: DeriveCaptureStepStatesInput): string | null {
  switch (key) {
    case 'condition':
      return input.conditionGradedAt;
    case 'contents':
      return input.contentsConfirmedAt;
    case 'label':
      return input.labelPreviewedAt;
    default:
      return input.evidenceAt?.[key] ?? null;
  }
}

/** The whole procedure, in vocabulary order, with each step's state. */
export function deriveProcedureSteps(
  input: DeriveCaptureStepStatesInput,
): ReadonlyArray<ProcedureStepRow> {
  const states = deriveCaptureStepStates(input);
  return captureStepVocabulary(input.vocabulary).map((step, index) => {
    const state = states[step.key] ?? 'pending';
    return {
      key: step.key,
      label: step.label,
      state,
      position: index + 1,
      stage: step.stage,
      at: state === 'done' ? stepCompletedAt(step.key, input) : null,
    };
  });
}
