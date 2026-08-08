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

/**
 * Capture-stack step gates — the bench half of the operator-facing unbox
 * procedure:
 *
 *   Arrival photos → Shipping label → The box → Packing material
 *   → Contents → Condition → Item photos → Serial → Label
 *
 * A sibling vocabulary over the same shared walk (`deriveLinearStepStates`),
 * beside the matched stepper (`derive-receiving-step-states`) and the unfound one
 * (`derive-unfound-step-states`). It is longer and photo-aware because the
 * procedure renders one row per step, where the 3-dot progress bar rendered
 * one dot for "Photos" as a whole. Same primitive, different job — not a fork
 * (AGENTS.md → compose → grow the SoT → compound).
 *
 * ## Photo stage AND aspect — two axes, both gated
 *
 * `photoStage` says which evidentiary moment (`@/lib/receiving/photo-intent`);
 * `photoAspect` says which shot of that moment (`@/lib/photos/photo-aspects`).
 * They are orthogonal, so the carton steps that share `unbox_carton` are told
 * apart by aspect alone:
 *
 *   arrival_check        → arrival_package                      (door / Triage)
 *   shipping_label_photo → unbox_carton · shipping_label        (the bench's own
 *   box_photo            → unbox_carton · box_exterior           carton capture,
 *   packing_material     → unbox_carton · packing_material       three shots)
 *   item_photos          → unbox_item   · required aspect set   (RECEIVING_LINE)
 *
 * **`arrival_check` is a VERIFY step on the bench, never a capture step.** Its
 * stage is the pre-opening insurance shot, and the `require_one` receive gate
 * counts only that stage (`photo-policy.ts` — it even names the confusion in its
 * blocker string). A bench capture that stamped `arrival_package` would silently
 * satisfy the gate with a post-opening photo and void the control. Bench captures
 * land on `unbox_carton` / `unbox_item`; step 1 reads what the door already shot.
 *
 * ## Condition IS a gate now (reversed 2026-08-01)
 *
 * It used to be `ungated`: `condition_grade` is NOT NULL with a default, so a
 * grade always exists and "graded" was indistinguishable from "never touched" —
 * gating on the grade would have stalled every carton on a decision that already
 * had a correct answer. The fix was not to keep skipping it but to record the
 * ACT: `receiving_line_testing.condition_graded_at` is stamped when an operator
 * explicitly grades. The stored default still pre-selects the chip, so satisfying
 * the step is one tap or one scanned condition code — a confirmation, never a
 * decision from scratch. The old reasoning is respected by that pre-selection,
 * not by skipping the step.
 *
 * `contents` has the same shape and the same answer: nothing recorded that a
 * human had read the line list, so `receiving_unbox.contents_confirmed_at` is
 * that fact. `label` (2026-08-02) is the third of the same family — reading the
 * face the carton is about to print leaves no evidence behind, so
 * `receiving_line_testing.label_previewed_at` is the acknowledgement itself.
 * None of the three is backfilled — a stamp asserts a person did something at a
 * time, so a pre-existing carton reads pending, which is honest and is one tap
 * away.
 *
 * These three are NOT the hand-ticked checklist deleted 2026-08-01. That list
 * let an operator tick "photographed the packing material" — a claim about
 * EVIDENCE, which the carton can answer for itself and therefore must. An
 * acknowledgement that someone READ something is the one fact only a person can
 * supply, and each column's name says exactly that and nothing more.
 */

// Not exported until a consumer outside this module needs it — the knip ratchet
// only shrinks, and "Phase 3 will import it" is exactly the claim it exists to
// reject. Consumers reach these through `CaptureStepDef` / `ProcedureStepRow`.
type CaptureStepKey =
  | 'classify'
  | 'arrival_check'
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
  /**
   * Open `string`, not `CaptureStepKey`: the vocabulary is resolved from the
   * station declaration now, so this module does not get to close the set.
   * `CaptureStepKey` narrowed by `isCaptureStepKey` is the separate question of
   * which keys this module can GATE.
   */
  key: string;
  label: string;
  /** Photo stage this step is evidenced by, when it is a photo step. */
  stage?: CaptureStepStage;
  /** The single shot this step is evidenced by, within {@link stage}. */
  aspect?: PhotoAspect;
  /** The aspect SET this step is evidenced by — `item_photos`. */
  aspectSet?: readonly PhotoAspect[];
  /**
   * Declared for multi-qty lines so the row can carry `n of N` progress.
   * Phase 2 (main Unbox dock): fill every expected serial (or waive), then
   * **one** line-level condition + item-photos — not Serial→Condition→Photos×N.
   * A true per-unit trio loop remains Phase 3.
   */
  perUnit?: boolean;
}

/**
 * Every key this module knows how to GATE. The vocabulary itself is no longer
 * declared here (see `captureStepVocabulary`) — this is the bench's half of the
 * contract: the declaration says which steps exist and in what order, and this
 * says which of them this module can decide "done" for.
 *
 * A declared capture step missing from here is a CI failure, not a runtime one
 * (`procedure-divergence.guard.test.ts`), so the bench can never quietly render
 * a step it has no gate for.
 */
const GATED_KEYS: Record<CaptureStepKey, true> = {
  classify: true,
  arrival_check: true,
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

/**
 * The ordered step list for one carton's intake type — RESOLVED FROM THE STATION
 * DECLARATION, not declared here.
 *
 * This module used to own its own ordered vocabulary, and the Studio Procedure
 * lens owned a different one. Both docblocks claimed to be "the operator-facing
 * unbox procedure" and they disagreed — 5 steps here, 7 there, different photo
 * granularity, different variant handling. An operator taught one procedure at
 * the bench while the owner reads another in Studio is worse than either being
 * wrong alone, because both look authoritative.
 *
 * They were never really in conflict: the bench list is the `capture` PHASE of
 * one procedure. `intake` (the scan) has already happened by the time this
 * renders, and `commit` (print · receive) belongs to the terminal dock. So the
 * declaration in `@/lib/stations/procedure` owns which steps exist, their order,
 * their labels, their photo stages and the named flows; this module owns only
 * the GATES — what counts as done, which needs the live row and is why the two
 * halves stay split.
 */
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
   * Per-aspect photo counts on THIS carton (`unbox_carton` stage). A missing key
   * is zero — the three carton shots are told apart by aspect alone, so a stage
   * count cannot answer them.
   */
  cartonAspectCounts: Partial<Record<PhotoAspect, number>>;
  /** Per-aspect photo counts on THIS line (`unbox_item` stage). */
  itemAspectCounts: Partial<Record<PhotoAspect, number>>;
  /**
   * Org policy — which item aspects BLOCK the step
   * (`receiving.requiredItemPhotoAspects`, default `included` + `serial`).
   *
   * Required rather than defaulted here on purpose: an empty list is a real,
   * legal answer ("no aspect is mandatory") and a defaulted six-shot minimum
   * would make `item_photos` un-completable for a two-person reseller. The
   * caller resolves the org's answer; this module only applies it.
   */
  requiredItemAspects: readonly PhotoAspect[];
  /** `receiving_line_testing.condition_graded_at` — the grading ACT, not the grade. */
  conditionGradedAt: string | null;
  /** `receiving_unbox.contents_confirmed_at` — a human read the line list. */
  contentsConfirmedAt: string | null;
  /**
   * `receiving_line_testing.label_previewed_at` — a human read the printed face.
   *
   * NOT `label_note` (that answers "was the face customised", and is null on
   * every carton whose default face was already right — gating on it parks the
   * pointer on the last step forever) and NOT `label_printed_at` (the COMMIT act
   * the terminal dock owns; gating a capture step on it inverts the phase order).
   */
  labelPreviewedAt: string | null;
  /** Unfound only — `isIntakeClassified(row)`. Ignored for matched cartons. */
  classified?: boolean;
  /**
   * When each step's evidence landed, by step key — a raw server instant, never
   * a formatted string (this module is shared with a server read model, and
   * formatting is the display layer's job).
   *
   * WHICH instant is the caller's fact-resolution job and differs by surface:
   * the bench reads the photo payload it already holds, the receipt reads
   * aggregate SQL. WHETHER that instant may be shown is this module's job, and
   * it has exactly one answer — see {@link deriveProcedureSteps}.
   *
   * The three acknowledgement steps need no entry: for `condition`, `contents`
   * and `label` the GATE FACT *is* the time, so {@link stepCompletedAt} reads it
   * off the gate input rather than trusting two callers to pass the same instant
   * twice. A caller that supplied one here would be silently ignored, which is
   * the point — there is nothing to disagree about.
   */
  evidenceAt?: Readonly<Record<string, string | null | undefined>>;
}

/** Per-step completion gates. Every declared capture step has exactly one. */
export function deriveCaptureStepFlags(
  input: DeriveCaptureStepStatesInput,
): ReadonlyArray<LinearStepFlag> {
  // Serial reuses the matched flow's gate verbatim (whole-line waiver →
  // per-unit accounting → overage), so the stack and the 3-dot bar can never
  // disagree about whether serials are complete. `labelPrinted` only feeds the
  // Print flag, which this vocabulary does not have — pinned false and dropped.
  const base = deriveReceivingStepFlags({ ...input, labelPrinted: false });

  return captureStepVocabulary(input.vocabulary).map((step): LinearStepFlag => {
    // The vocabulary now comes from the declaration, so a step could in
    // principle arrive without a gate here. Render it NOT DONE rather than
    // throwing — a bench that crashes mid-carton is far worse than one showing
    // an extra unchecked row — and let the divergence guard fail CI so it never
    // reaches an operator.
    if (!isCaptureStepKey(step.key)) return { key: step.key, done: false };
    switch (step.key) {
      case 'classify':
        return { key: step.key, done: !!input.classified };
      case 'arrival_check':
        return { key: step.key, done: input.arrivalPhotoCount > 0 };
      // The three bench carton shots share one stage and are told apart by
      // aspect. Gating any of them on the STAGE count would let one photo
      // satisfy all three — the same over-counting `sqlCartonStagePhotoCount`
      // exists to stop one level up.
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
        // Reading a label leaves no evidence behind, so the acknowledgement is
        // the only fact there is — the same shape as `contents`. It is not a
        // hand-tick of the deleted-checklist kind: that let an operator claim
        // EVIDENCE the carton itself could answer for.
        return { key: step.key, done: !!input.labelPreviewedAt };
    }
  });
}

/**
 * One carton shot of `aspect` exists. A step that declares no aspect falls back
 * to the stage count — never to `true`: an un-aspected photo step is a
 * declaration bug, and reading it as satisfied would hide the bug behind a
 * green row.
 */
function cartonAspectShot(
  input: DeriveCaptureStepStatesInput,
  aspect: PhotoAspect | undefined,
): boolean {
  if (!aspect) return input.unboxCartonPhotoCount > 0;
  return (input.cartonAspectCounts[aspect] ?? 0) > 0;
}

/**
 * Every REQUIRED item aspect has at least one shot.
 *
 * With no required aspects the org has said "any item photo will do", so this
 * falls back to the line's stage count rather than reading vacuously true —
 * `[].every()` is `true`, which would mark the step done on a line with no
 * photos at all.
 */
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

/**
 * The instant a step's gate closed, before the done check.
 *
 * The three acknowledgement steps resolve off the gate input itself, because
 * there the fact that closes the gate *is* an instant — reading it here is what
 * makes "the time and the state agree" structural rather than a caller's
 * promise. Every other step's evidence is a photo, a serial or an audit row,
 * none of which this pure module can see, so those come from the caller.
 */
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
 *
 * ## `at` rides ONLY on a done step, and that rule lives here alone
 *
 * A step can legitimately hold partial evidence and still be pending — one
 * required item aspect out of two, say — and printing that evidence's timestamp
 * beside a pending row reads as a completion. Both readers (the bench deck and
 * the receipt) get the answer from this one line, so neither can decide it
 * differently: that is the same reason the STATE is derived here rather than
 * twice.
 */
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
