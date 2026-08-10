/**
 * Unbox procedure RECEIPT — what was done to this carton, when, and by whom.
 *
 * ## It is a read model. There is no receipt table, and there must not be one.
 *
 * Every step's state is DERIVED from facts the carton already carries: photos at
 * a stage and aspect, serials, the condition and contents stamps, the label
 * print, the receive. Nothing is ticked by hand, so nothing can be ticked
 * falsely — the org-editable checklist this replaced was deleted 2026-08-01
 * precisely because a box got ticked when someone remembered to tick it.
 *
 * ## One derivation, two readers
 *
 * The bench procedure and the receipt must never disagree about whether a step
 * is done, so this does not re-implement the gates: it calls
 * {@link deriveProcedureSteps} — the same function the bench calls — and adds
 * only the WHEN and the WHO, which the bench does not need and this does.
 * `procedure-receipt-derivation.guard.test.ts` pins that. The day the two
 * derive independently is the day an operator is told two different things
 * about the same box.
 *
 * The commit steps (print · stage · receive) are the receipt's own addition:
 * they are declared `phase: 'commit'`. Print · Receive live on the dogfood
 * strip; `stage` arms Band 1 after print. A closed-carton receipt is incomplete
 * without the acts that closed it.
 *
 * ## `at` is the SERVER instant, never the device's
 *
 * `photos.client_captured_at` is the camera shutter wall clock and is not
 * server-attested — a drifted tablet yields a wrong-but-plausible time, and a
 * concealed-damage dispute turns on which of the two you are reading. So `at`
 * is always `created_at` (the server INSERT), and the shutter clock rides along
 * as `capturedAt`, secondary and clearly labelled. That is what the column's own
 * docblock demands.
 *
 * ## A pending step shows NO time
 *
 * Evidence is attached only to a step the shared derivation calls done. A step
 * can legitimately hold evidence and still be pending — one required item aspect
 * out of two, say — and printing that partial evidence's timestamp beside a
 * pending row would read as a completion.
 */

import {
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from '@/components/receiving/workspace/derive-capture-step-states';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
} from '@/lib/stations/procedure';

type ProcedureStepState = 'done' | 'active' | 'pending';

export interface ProcedureStepReceipt {
  key: string;
  label: string;
  state: ProcedureStepState;
  /** Server-attested completion instant. NULL when the step is not done. */
  at: string | null;
  byStaffId: number | null;
  byStaffName: string | null;
  /** Operator-facing one-liner: "4 photos · shipping label, box". */
  detail: string | null;
  /** Device shutter clock when it exists. SECONDARY — never substituted for `at`. */
  capturedAt: string | null;
}

/** What the carton knows about one step, independent of whether it is done. */
export interface StepEvidence {
  at?: string | null;
  byStaffId?: number | null;
  byStaffName?: string | null;
  detail?: string | null;
  capturedAt?: string | null;
}

interface ProcedureReceiptInput {
  /**
   * The gate inputs — byte-identical to what the bench feeds
   * {@link deriveProcedureSteps}. Passing the same shape (rather than a
   * receipt-specific one) is what makes "one derivation, two readers" a
   * structural fact instead of a promise.
   */
  gates: DeriveCaptureStepStatesInput;
  /** Evidence per step key. A missing key means nothing was recorded. */
  evidence: Record<string, StepEvidence>;
  /** `receiving_line_testing.label_printed_at`, folded across the carton's lines. */
  labelPrintedAt: string | null;
  /** `receiving_line_putaway.staged_at`, folded across the carton's lines. */
  stagedAt?: string | null;
  /** `receiving_carton.received_at` — also the receipt's `closedAt`. */
  receivedAt: string | null;
}

export interface ProcedureReceipt {
  steps: ProcedureStepReceipt[];
  /**
   * When the carton was closed out. NULL means the procedure is still open, and
   * the surface should render the working view rather than a receipt.
   */
  closedAt: string | null;
}

function attach(
  key: string,
  label: string,
  state: ProcedureStepState,
  evidence: Record<string, StepEvidence>,
  /**
   * The completion instant, already resolved and already done-gated.
   *
   * Capture steps take it straight from {@link deriveProcedureSteps}, so the
   * rule "a time rides only on a done step" is decided in exactly one place for
   * both readers rather than restated here. The `done` re-check below is a
   * no-op for those and carries the commit steps, whose instants are this
   * module's own.
   */
  at: string | null,
): ProcedureStepReceipt {
  const found = evidence[key] ?? {};
  // Evidence rides ONLY on a done step. A pending step with partial evidence
  // showing a timestamp reads as a completion.
  const done = state === 'done';
  return {
    key,
    label,
    state,
    at: done ? at : null,
    byStaffId: done ? (found.byStaffId ?? null) : null,
    byStaffName: done ? (found.byStaffName ?? null) : null,
    // The detail is a description of the evidence ("2 photos"), not a claim of
    // completion, so it survives a pending state — that is what tells an
    // operator *how far* a partially-worked step got.
    detail: found.detail ?? null,
    capturedAt: done ? (found.capturedAt ?? null) : null,
  };
}

/**
 * The receipt, derived. Pure — no DB, no clock, no I/O — so the guard can feed
 * it the same fact set it feeds the bench and compare the two answers.
 */
export function buildProcedureReceipt(input: ProcedureReceiptInput): ProcedureReceipt {
  registerBuiltinProcedures();
  const unbox = getProcedure('unbox');
  if (!unbox) return { steps: [], closedAt: input.receivedAt };

  // Capture — the shared derivation, verbatim. Never re-derived here, and that
  // now covers `at` as well as the state: the caller hands its resolved
  // instants in through `gates.evidenceAt` and reads them back off the step.
  const steps: ProcedureStepReceipt[] = deriveProcedureSteps(input.gates).map((step) =>
    attach(step.key, step.label, step.state, input.evidence, step.at),
  );

  // Commit — the receipt's own steps, in declaration order. `print` when the
  // label was printed; `stage` when a putaway location was scanned; `receive`
  // when the carton was received.
  const commitDone: Record<string, string | null> = {
    print: input.labelPrintedAt,
    stage: input.stagedAt ?? null,
    receive: input.receivedAt,
  };
  const commit = resolveProcedureSteps(unbox, input.gates.vocabulary, 'commit');
  let firstIncompleteSeen = steps.some((s) => s.state !== 'done');
  for (const step of commit) {
    const at = commitDone[step.key] ?? null;
    let state: ProcedureStepState;
    if (at) {
      state = 'done';
    } else if (firstIncompleteSeen) {
      state = 'pending';
    } else {
      state = 'active';
      firstIncompleteSeen = true;
    }
    steps.push(attach(step.key, step.label, state, input.evidence, at));
  }

  return { steps, closedAt: input.receivedAt };
}
