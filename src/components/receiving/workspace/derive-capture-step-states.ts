import {
  deriveReceivingStepFlags,
  deriveLinearStepStates,
  type DeriveReceivingStepStatesInput,
  type LinearStepFlag,
  type LinearStepState,
} from './derive-receiving-step-states';

/**
 * Capture-stack step vocabulary — the operator-facing unbox procedure:
 *
 *   PO / box photos → Packing material → Item photos → Condition → Serial
 *
 * A THIRD sibling vocabulary over the same shared walk (`deriveLinearStepStates`),
 * beside the matched stepper (`derive-receiving-step-states`) and the unfound one
 * (`derive-unfound-step-states`). It is longer and photo-stage-aware because the
 * capture stack renders one card per step, where the 3-dot progress bar rendered
 * one dot for "Photos" as a whole. Same primitive, different job — not a fork
 * (AGENTS.md → compose → grow the SoT → compound).
 *
 * ## Photo stages (blocker B2, decided 2026-08-01)
 *
 * The three photo steps map ONE-TO-ONE onto the three receiving stages that
 * already exist (`@/lib/receiving/photo-intent`). "Packing material" is FOLDED
 * into `unbox_carton` — the opened box and its dunnage are the same evidentiary
 * moment — so no stage was added.
 *
 *   po_photos        → arrival_package   (door / Triage evidence)
 *   packing_material → unbox_carton      (the bench's own carton capture)
 *   item_photos      → unbox_item        (RECEIVING_LINE)
 *
 * **`po_photos` is a VERIFY step on the bench, never a capture step.** Its stage
 * is the pre-opening insurance shot, and the `require_one` receive gate counts
 * only that stage (`photo-policy.ts:149` — it even names the confusion in its
 * blocker string). A bench capture that stamped `arrival_package` would silently
 * satisfy the gate with a post-opening photo and void the control. Bench captures
 * land on `unbox_carton` / `unbox_item`; step 1 reads what the door already shot.
 *
 * ## Condition is not a gate
 *
 * `condition_grade` is NOT NULL with a default, so the pill always shows a grade
 * (the auto-A UX). The condition step therefore renders as ALREADY SATISFIED with
 * that default and the active pointer skips over it — the operator taps it (or
 * scans a condition token) to change the grade. Making it block would stall every
 * carton on a decision that already has a correct answer. Same reasoning that
 * kept `condition` out of the 3-dot bar (`derive-receiving-step-states` doc).
 */

// Not exported until a consumer outside this module needs it — the knip ratchet
// only shrinks, and "Phase 3 will import it" is exactly the claim it exists to
// reject. Consumers reach these through `CaptureStepDef` / `ProcedureStepRow`.
type CaptureStepKey =
  | 'classify'
  | 'po_photos'
  | 'packing_material'
  | 'item_photos'
  | 'condition'
  | 'serial';

/** The receiving photo stage a step reads (and, from Phase 3, captures into). */
type CaptureStepStage = 'arrival_package' | 'unbox_carton' | 'unbox_item';

interface CaptureStepDef {
  key: CaptureStepKey;
  label: string;
  /** Photo stage this step is evidenced by, when it is a photo step. */
  stage?: CaptureStepStage;
  /**
   * The step is satisfied by default and the active pointer skips it (condition).
   * It still renders — as a done row showing the current value — because the
   * operator must be able to see and change it.
   */
  ungated?: boolean;
  /**
   * Step repeats per unit on a multi-qty line, so the row carries `n of N`.
   * The loop itself is Phase 3; Phase 2 only reports progress.
   */
  perUnit?: boolean;
}

/** Ordered vocabulary for a matched carton — the default procedure. */
const CAPTURE_STEPS: ReadonlyArray<CaptureStepDef> = [
  { key: 'po_photos', label: 'PO / box photos', stage: 'arrival_package' },
  { key: 'packing_material', label: 'Packing material', stage: 'unbox_carton' },
  { key: 'item_photos', label: 'Item photos', stage: 'unbox_item', perUnit: true },
  { key: 'condition', label: 'Condition', ungated: true, perUnit: true },
  { key: 'serial', label: 'Serial', perUnit: true },
];

const STEP_CLASSIFY: CaptureStepDef = { key: 'classify', label: 'Classify' };

export interface CaptureStepVocabularyInput {
  /** Unfound carton — identity resolution comes first (mirrors the unfound stepper). */
  isUnfound: boolean;
  /**
   * Local pickup — the goods were handed over, not shipped, so there is no
   * carrier dunnage to photograph. Drops `packing_material` only; the arrival
   * and item evidence steps still apply to what was handed over.
   */
  isLocalPickup: boolean;
  /**
   * Return — the serial identifies WHICH unit is being graded, so it is captured
   * before the grade rather than after. Order swap only; both steps still render.
   */
  isReturn: boolean;
}

/**
 * The ordered step list for one carton's intake type. Hardcoding the five steps
 * is what breaks unfound / local pickup / returns — resolve through here.
 */
export function captureStepVocabulary(
  input: CaptureStepVocabularyInput,
): ReadonlyArray<CaptureStepDef> {
  let steps = [...CAPTURE_STEPS];

  if (input.isLocalPickup) {
    steps = steps.filter((s) => s.key !== 'packing_material');
  }

  if (input.isReturn) {
    // Serial before Condition: the scan names the unit the grade applies to.
    const condition = steps.findIndex((s) => s.key === 'condition');
    const serial = steps.findIndex((s) => s.key === 'serial');
    if (condition >= 0 && serial > condition) {
      const [serialStep] = steps.splice(serial, 1);
      steps.splice(condition, 0, serialStep);
    }
  }

  return input.isUnfound ? [STEP_CLASSIFY, ...steps] : steps;
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
  /** Unfound only — `isIntakeClassified(row)`. Ignored for matched cartons. */
  classified?: boolean;
}

/**
 * Per-step completion gates. `condition` is absent by design — it is `ungated`
 * and always reads done (see the module doc).
 */
export function deriveCaptureStepFlags(
  input: DeriveCaptureStepStatesInput,
): ReadonlyArray<LinearStepFlag> {
  // Serial reuses the matched flow's gate verbatim (whole-line waiver →
  // per-unit accounting → overage), so the stack and the 3-dot bar can never
  // disagree about whether serials are complete. `labelPrinted` only feeds the
  // Print flag, which this vocabulary does not have — pinned false and dropped.
  const base = deriveReceivingStepFlags({ ...input, labelPrinted: false });

  return captureStepVocabulary(input.vocabulary).map((step): LinearStepFlag => {
    switch (step.key) {
      case 'classify':
        return { key: step.key, done: !!input.classified };
      case 'po_photos':
        return { key: step.key, done: input.arrivalPhotoCount > 0 };
      case 'packing_material':
        return { key: step.key, done: input.unboxCartonPhotoCount > 0 };
      case 'item_photos':
        return { key: step.key, done: input.itemPhotoCount > 0 };
      case 'condition':
        // Ungated: always done, so the active pointer lands on the next real job.
        return { key: step.key, done: true };
      case 'serial':
        return { key: step.key, done: base.serial };
    }
  });
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
): CaptureStepKey | null {
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
}

/**
 * The whole procedure, in vocabulary order, with each step's state.
 *
 * Deliberately boring: EVERY step renders, in declaration order, done or not.
 * That is the simplification over the mid-canvas capture stack this replaces —
 * it hid pending steps and re-sorted completed ones so the current card could
 * sit at the bottom, which made the procedure unreadable as a procedure and
 * needed two extra rules (an "ungated steps only join the ledger once the
 * pointer passes them" carve-out, and a position field divorced from the render
 * index) purely to undo its own reordering. A checklist needs neither.
 */
export function deriveProcedureSteps(
  input: DeriveCaptureStepStatesInput,
): ReadonlyArray<ProcedureStepRow> {
  const states = deriveCaptureStepStates(input);
  return captureStepVocabulary(input.vocabulary).map((step, index) => ({
    key: step.key,
    label: step.label,
    state: states[step.key] ?? 'pending',
    position: index + 1,
    stage: step.stage,
  }));
}
